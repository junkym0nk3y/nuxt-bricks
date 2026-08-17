/**
 * Общая логика ручек `/api/bricks/users/**`: доступность раздела, запрет
 * операций над собой и валидация DTO.
 *
 * Гард по роли (`admin`) здесь НЕ повторяется — он живёт в auth-middleware
 * (`rolePolicy.ts`), единственном разборщике путей проекта. Второй разборщик
 * рядом с ним неизбежно разошёлся бы с ним в краях, а именно такой разрыв уже
 * приводил к обходу гарда кодированным путём.
 */
import { createError, type H3Event } from 'h3';
import { useRuntimeConfig } from 'nitropack/runtime';
import {
    BRICKS_NEW_USERNAME_MAX_LENGTH,
    BRICKS_NEW_USERNAME_MIN_LENGTH,
    BRICKS_NEW_USERNAME_PATTERN,
    BRICKS_PASSWORD_MAX_LENGTH,
    BRICKS_PASSWORD_MIN_LENGTH,
    BRICKS_ROLE_RANK,
} from '../../../modules/common/constants/auth';
import { BRICKS_API_ERROR_CODES } from '../../../modules/common/constants/apiErrors';
import { isUserManagementAvailable } from './rolePolicy';
import {
    assertKnownKeys,
    invalid,
    optionalBoolean,
    requireString,
} from '../../../modules/persistence/server/utils/payloadPrimitives';
import { runScryptTask, GateOverflowError } from './scryptGate';
import { hashPassword } from './passwords';
import type { TBricksUserRole } from '../../../modules/common/types/auth';
import type {
    IAuthUserStateChange,
    ICreateAuthUserPayload,
} from '../../../modules/persistence/types/adapters';

/** Разрешённые ключи тела создания учётки. */
const CREATE_USER_KEYS: ReadonlySet<string> = new Set(['username', 'password', 'role']);

/** Разрешённые ключи тела правки учётки администратором. */
const UPDATE_USER_KEYS: ReadonlySet<string> = new Set(['role', 'isActive']);

/** Разрешённые ключи тела смены чужого пароля. */
const PASSWORD_KEYS: ReadonlySet<string> = new Set(['password']);

/**
 * Проверяет, что значение — известная роль. Ключи `BRICKS_ROLE_RANK` типизованы
 * как `string`, поэтому проверка идёт по самому объекту ранга: отдельный список
 * ролей рядом с ним разошёлся бы молча.
 *
 * @param value - Сырое значение поля.
 */
function isBricksUserRole(value: unknown): value is TBricksUserRole {
    return typeof value === 'string' && Object.hasOwn(BRICKS_ROLE_RANK, value);
}

/**
 * Требует роль в теле запроса; 400 — если значение не роль.
 *
 * @param value - Сырое значение поля.
 * @param field - Имя поля для сообщения об ошибке.
 */
function requireRole(value: unknown, field: string): TBricksUserRole {
    if (!isBricksUserRole(value)) {
        invalid(`Field "${field}" must be one of: ${Object.keys(BRICKS_ROLE_RANK).join(', ')}`);
    }

    return value;
}

/**
 * Проверяет пароль как строку в допустимых границах. Пробелы НЕ обрезаются:
 * пробел — законный символ пароля, и `trim` менял бы то, что человек ввёл
 * (обрезанный пароль потом не подошёл бы при входе).
 *
 * @param value - Сырое значение поля.
 * @returns Пароль в открытом виде.
 */
function requirePassword(value: unknown): string {
    if (typeof value !== 'string') {
        invalid('Field "password" must be a string');
    }

    if (value.length < BRICKS_PASSWORD_MIN_LENGTH) {
        invalid(`Field "password" must be at least ${BRICKS_PASSWORD_MIN_LENGTH} characters`);
    }

    if (value.length > BRICKS_PASSWORD_MAX_LENGTH) {
        invalid(`Field "password" must be at most ${BRICKS_PASSWORD_MAX_LENGTH} characters`);
    }

    return value;
}

/**
 * Приводит логин к канонической форме и проверяет формат.
 *
 * Регистр снимается ДО проверки формата: уникальность держится индексом по
 * `lower(username)`, вход регистронезависим, и `Ivan` с `ivan` — одна учётка.
 * Хранить введённый регистр значило бы показывать в списке имя, отличающееся от
 * того, чем реально входят.
 *
 * @param value - Сырое значение поля.
 * @returns Логин в нижнем регистре.
 */
function requireUsername(value: unknown): string {
    const raw = requireString(value, 'username', {
        min: BRICKS_NEW_USERNAME_MIN_LENGTH,
        max: BRICKS_NEW_USERNAME_MAX_LENGTH,
    });

    return requireString(raw.toLowerCase(), 'username', {
        min: BRICKS_NEW_USERNAME_MIN_LENGTH,
        max: BRICKS_NEW_USERNAME_MAX_LENGTH,
        pattern: BRICKS_NEW_USERNAME_PATTERN,
        patternHint: 'latin letters, digits and . _ @ + - are allowed',
    });
}

/**
 * Считает scrypt-хеш под общим семафором; переполнение очереди — 503 (тот же
 * ответ, что у логина: сервер занят, повтор осмыслен).
 *
 * Через семафор, а не напрямую: derive занимает секунды CPU, и серия созданий
 * учёток иначе отняла бы процессор у входов.
 *
 * @param password - Пароль в открытом виде.
 */
async function hashPasswordUnderGate(password: string): Promise<string> {
    try {
        return await runScryptTask(() => hashPassword(password));
    } catch (error: unknown) {
        if (error instanceof GateOverflowError) {
            throw createError({
                statusCode: 503,
                statusMessage: 'Server is busy, try again later',
            });
        }

        throw error;
    }
}

/**
 * Отказывает, если управление учётками недоступно: не database-режим или
 * выключено опцией `auth.allowUserManagement`.
 *
 * 404, а не 403: 403 подтверждал бы, что раздел в сборке есть и просто закрыт
 * администратору. Ответ обеих причин одинаков намеренно — снаружи они
 * неразличимы.
 *
 * Второй рубеж: первым тот же 404 отдаёт auth-middleware, до гарда по роли и
 * CSRF-гейта, — иначе выключенный раздел выдавал бы себя чужими статусами
 * (403 редактору, 401 анониму). Здесь проверка остаётся на случай ручки,
 * зарегистрированной вне матрицы путей middleware.
 *
 * @param event - Событие запроса.
 */
export function assertUserManagementAvailable(event: H3Event): void {
    const config = useRuntimeConfig(event);

    if (!isUserManagementAvailable(config.bricksAuthMode, config.bricksAuthAllowUserManagement)) {
        throw createError({ statusCode: 404, statusMessage: 'Not Found' });
    }
}

/**
 * Отказывает, если запрос направлен на собственную учётку.
 *
 * Причина не в удобстве: админ-ручка пароля не спрашивает текущий пароль (его
 * незачем знать администратору, задающему пароль другому), а ручка своего
 * профиля спрашивает — иначе украденная кука меняет пароль сама и запирает
 * владельца. Разреши админ-путь для себя, и это требование обходится в один
 * запрос. Роль и активность себе не правятся по той же причине: собственные
 * права не должны меняться мимо второго администратора.
 *
 * @param event - Событие запроса.
 * @param targetUserId - Идентификатор учётки-цели.
 */
export function assertNotSelfTarget(event: H3Event, targetUserId: number): void {
    if (event.context.bricksUser?.id !== targetUserId) {
        return;
    }

    throw createError({
        statusCode: 409,
        statusMessage: 'Use the profile endpoints to change your own account',
        data: { code: BRICKS_API_ERROR_CODES.selfTargetForbidden },
    });
}

/**
 * Валидирует тело создания учётки и хеширует пароль: адаптер пароля в открытом
 * виде не видит вовсе.
 *
 * @param body - Нормализованное тело запроса.
 * @returns Данные для адаптера.
 */
export async function buildCreateUserPayload(
    body: Record<string, unknown>
): Promise<ICreateAuthUserPayload> {
    assertKnownKeys(body, CREATE_USER_KEYS);

    const username = requireUsername(body.username);
    const password = requirePassword(body.password);
    const role = requireRole(body.role, 'role');

    return {
        username,
        role,
        passwordHash: await hashPasswordUnderGate(password),
    };
}

/**
 * Валидирует тело правки учётки: роль и/или активность, хотя бы одно поле.
 *
 * @param body - Нормализованное тело запроса.
 */
export function validateUpdateUserPayload(body: Record<string, unknown>): IAuthUserStateChange {
    assertKnownKeys(body, UPDATE_USER_KEYS);

    const role = body.role === undefined ? undefined : requireRole(body.role, 'role');
    const isActive = optionalBoolean(body.isActive, 'isActive');

    if (role === undefined && isActive === undefined) {
        invalid('At least one of "role" or "isActive" is required');
    }

    return { role, isActive };
}

/**
 * Валидирует тело смены чужого пароля и хеширует его.
 *
 * @param body - Нормализованное тело запроса.
 * @returns Хеш пароля для адаптера.
 */
export async function buildUserPasswordHash(body: Record<string, unknown>): Promise<string> {
    assertKnownKeys(body, PASSWORD_KEYS);

    return hashPasswordUnderGate(requirePassword(body.password));
}
