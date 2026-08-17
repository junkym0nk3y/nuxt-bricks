/**
 * Общая логика ручек своего профиля (`/api/bricks/users/me/**`): доступность,
 * пользователь запроса, валидация DTO и проекция ответа.
 *
 * Профиль живёт отдельно от управления учётками (`userManagement.ts`) не по
 * стилю, а по правам: своё имя, фото и пароль правит любой вошедший, включая
 * наблюдателя, и флаг `allowUserManagement` профиля не касается — он про ведение
 * ЧУЖИХ учёток снаружи. Общее у них ровно то, что вынесено в
 * `userManagement.ts` и переиспользуется здесь: границы пароля, хеширование под
 * семафором и гейт флага смены пароля.
 *
 * Целевая учётка здесь всегда одна — та, чья сессия пришла с запросом. Никакого
 * `:id` эти ручки не принимают вовсе: приняли бы — и «свой профиль» стал бы
 * ручкой правки любого профиля, отличающейся от админской только тем, что её
 * забыли закрыть.
 */
import { createError, type H3Event } from 'h3';
import { useRuntimeConfig } from 'nitropack/runtime';
import {
    BRICKS_DISPLAY_NAME_MAX_LENGTH,
    BRICKS_DISPLAY_NAME_PATTERN,
    BRICKS_PASSWORD_MAX_LENGTH,
} from '../../../modules/common/constants/auth';
import { BRICKS_API_ERROR_CODES } from '../../../modules/common/constants/apiErrors';
import { requirePassword } from './userManagement';
import {
    assertKnownKeys,
    invalid,
    optionalNullableString,
} from '../../../modules/persistence/server/utils/payloadPrimitives';
import type { IAuthSessionUser } from '../../../modules/persistence/types/authAdapters';
import type { IAuthOwnPasswordInput, IAuthProfileInput, IAuthProfileUser } from './types';

/** Разрешённые ключи тела правки своего профиля. */
const PROFILE_KEYS: ReadonlySet<string> = new Set(['displayName']);

/** Разрешённые ключи тела смены своего пароля. */
const OWN_PASSWORD_KEYS: ReadonlySet<string> = new Set(['currentPassword', 'newPassword']);

/**
 * Отказывает, если учёток нет вовсе: профиль существует только в
 * database-режиме, в basic identity одна на всех и задана окружением — править
 * в ней нечего.
 *
 * 404 — тот же ответ, что у auth-ручки `me` вне database-режима: снаружи
 * «маршрута нет» и «режим другой» неразличимы, и различать их незачем.
 *
 * Флаг `allowUserManagement` здесь НЕ проверяется: он выключает ведение чужих
 * учёток из билдера, а не право человека сменить себе фото. Свой флаг у профиля
 * один — `allowPasswordChange`, и закрывает он только пароль.
 *
 * @param event - Событие запроса.
 */
export function assertProfileAvailable(event: H3Event): void {
    const config = useRuntimeConfig(event);

    if (config.bricksAuthMode !== 'database') {
        throw createError({ statusCode: 404, statusMessage: 'Not Found' });
    }
}

/**
 * Возвращает пользователя сессии, поставленного auth-middleware.
 *
 * Отказ здесь недостижим через маршруты модуля (профиль защищён матрицей путей),
 * но альтернатива — читать `id` из `undefined` и уйти в 500 либо, хуже,
 * применить правку не к той учётке. Поэтому «сессии нет» — явный 401.
 *
 * @param event - Событие запроса.
 * @returns Пользователь авторизованной сессии.
 */
export function requireSessionUser(event: H3Event): IAuthSessionUser {
    const user = event.context.bricksUser;

    if (!user) {
        throw createError({ statusCode: 401, statusMessage: 'Unauthorized' });
    }

    return user;
}

/**
 * Проекция учётки для ответов профиля и ручки `me` — без активности, поколения
 * и даты создания.
 *
 * Форма одна на все ручки, отдающие «кто я»: разъехавшись, они заставили бы угол
 * экрана угадывать, что именно приехало после сохранения профиля.
 *
 * @param user - Сессия или строка учётки (любая форма с этими полями).
 * @returns Публичная проекция профиля.
 */
export function toAuthProfileUser(user: IAuthProfileUser): IAuthProfileUser {
    return {
        id: user.id,
        username: user.username,
        role: user.role,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
    };
}

/**
 * Валидирует тело правки своего профиля.
 *
 * Принимается ТОЛЬКО отображаемое имя. Ссылки на фото здесь нет намеренно: её
 * ставят ручки аватара, которые сам файл и загрузили. Разреши её в теле — и в
 * колонку уехал бы произвольный внешний адрес, то есть чужой ресурс, который
 * грузится в углу билдера у каждого, кто видит эту учётку. Логин неизменяем, а
 * роль и активность себе не правятся мимо второго администратора.
 *
 * Пустая строка равна `null`: человек, стёрший имя, просит показывать логин, а не
 * пустое место.
 *
 * @param body - Нормализованное тело запроса.
 * @returns Проверенная правка.
 */
export function validateProfilePayload(body: Record<string, unknown>): IAuthProfileInput {
    assertKnownKeys(body, PROFILE_KEYS);

    const displayName = optionalNullableString(body.displayName, 'displayName', {
        max: BRICKS_DISPLAY_NAME_MAX_LENGTH,
        pattern: BRICKS_DISPLAY_NAME_PATTERN,
        patternHint: 'control characters are not allowed',
    });

    if (displayName === undefined) {
        invalid('Field "displayName" is required');
    }

    return { displayName };
}

/**
 * Валидирует тело смены своего пароля.
 *
 * Текущий пароль проверяется только на непустоту и потолок длины: минимальную
 * длину к нему применять нельзя — учётку мог создать CLI прежней версии или
 * администратор с более коротким паролем, и требование «не короче восьми» не
 * дало бы такому человеку сменить пароль вовсе. К НОВОМУ паролю применяются те
 * же границы, что на админском пути (`requirePassword`).
 *
 * @param body - Нормализованное тело запроса.
 * @returns Текущий и новый пароль в открытом виде.
 */
export function validateOwnPasswordPayload(body: Record<string, unknown>): IAuthOwnPasswordInput {
    assertKnownKeys(body, OWN_PASSWORD_KEYS);

    const { currentPassword } = body;

    if (typeof currentPassword !== 'string' || currentPassword.length === 0) {
        invalid('Field "currentPassword" is required');
    }

    if (currentPassword.length > BRICKS_PASSWORD_MAX_LENGTH) {
        invalid(`Field "currentPassword" must be at most ${BRICKS_PASSWORD_MAX_LENGTH} characters`);
    }

    return { currentPassword, newPassword: requirePassword(body.newPassword, 'newPassword') };
}

/**
 * Отказ «текущий пароль не совпал».
 *
 * 400 с машиночитаемым кодом, а не 401: клиентский интерцептор реагирует на
 * статус, а не на путь, и 401 увёл бы человека с рабочей сессией на форму
 * логина — вместо подсказки под одним полем формы.
 */
export function invalidCurrentPassword(): never {
    throw createError({
        statusCode: 400,
        statusMessage: 'Current password is incorrect',
        data: { code: BRICKS_API_ERROR_CODES.invalidCurrentPassword },
    });
}
