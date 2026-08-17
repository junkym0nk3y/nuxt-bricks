/**
 * Общие помощники для Nitro-ручек /api/bricks/** (parse → adapter → return).
 */
import { randomUUID } from 'node:crypto';
import { createError, getHeader, getRouterParam, type H3Event } from 'h3';
import { toCamelCaseShallow } from '../../../common/utils/case-transform';
import { PAGE_CONFLICT_CODES } from '../../../common/constants/publish';
import { BRICKS_API_ERROR_CODES } from '../../../common/constants/apiErrors';
import { readJsonBodyWithLimit } from './requestBodyLimits';
import {
    BricksPageAddressConflictError,
    BricksRevisionConflictError,
    BricksStatementTimeoutError,
    BricksUnknownMediaCategoryError,
} from './storageErrors';
import { BricksLastActiveAdminError, BricksUsernameTakenError } from './authErrors';

/** Строгий формат числового id: только цифры, без знака/дробей/хвостов ('1abc' ❌). */
const NUMERIC_ID_PATTERN = /^\d+$/;

/**
 * Лимит JSON-тела editorial-ручек: вдвое больше максимально валидного payload
 * (schema ограничена 2 МБ JSON в payloadValidation) — честные запросы проходят,
 * гигантские отбрасываются до буферизации.
 */
const MAX_JSON_BODY_BYTES = 4 * 1024 * 1024;

/**
 * Достаёт числовой параметр роута; 400 — если это не positive safe integer.
 *
 * @param event - Событие запроса.
 * @param paramName - Имя параметра роута (дефолт — 'id').
 * @returns Числовое значение параметра.
 */
export function requireNumericId(event: H3Event, paramName = 'id'): number {
    const rawId = getRouterParam(event, paramName);
    const id = rawId && NUMERIC_ID_PATTERN.test(rawId) ? Number(rawId) : Number.NaN;

    if (!Number.isSafeInteger(id) || id <= 0) {
        const label = paramName.charAt(0).toUpperCase() + paramName.slice(1);
        throw createError({
            statusCode: 400,
            statusMessage: `${label} must be a positive integer`,
        });
    }

    return id;
}

/**
 * Читает тело запроса (JSON, с лимитом размера — 413 до буферизации сверх
 * лимита) и нормализует top-level ключи snake_case → camelCase.
 * Вложенные объекты (включая `schema`) не трогаются. Проверяет только форму
 * «непустой объект» — типы/границы полей проверяют валидаторы
 * `payloadValidation.ts` в конкретных ручках.
 *
 * @param event - Событие запроса.
 * @returns Нормализованное тело запроса.
 */
export async function readNormalizedBody<T>(event: H3Event): Promise<T> {
    // Unsafe-запрос с не-JSON контентом (form/text) — типичный CSRF-вектор
    // мимо preflight; требуем явный application/json
    const contentType = getHeader(event, 'content-type') ?? '';

    if (!contentType.toLowerCase().includes('application/json')) {
        throw createError({
            statusCode: 415,
            statusMessage: 'Expected application/json body',
        });
    }

    const body = await readJsonBodyWithLimit<object>(event, MAX_JSON_BODY_BYTES);

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
        throw createError({
            statusCode: 400,
            statusMessage: 'Request body is required',
        });
    }

    return toCamelCaseShallow<T>(body);
}

/**
 * Глубина обхода цепочки `cause` при поиске остановки серверным лимитом
 * времени. Адаптер оборачивает такой отказ ровно один раз (вставка медиа —
 * в маркер отвергнутой записи), запас взят на будущие обёртки; ограничение
 * нужно, чтобы зацикленный `cause` не подвесил обработчик ошибки.
 */
const CAUSE_LOOKUP_DEPTH = 3;

/**
 * Ищет остановку запроса серверным лимитом времени в самой ошибке и в её
 * причинах.
 *
 * Обход цепочки нужен потому, что адаптер оборачивает отказ вставки в маркер
 * отвергнутой записи: без него загрузка вместо честного 504 с машиночитаемым
 * кодом отдавала бы generic 500, а повтор выглядел бы бессмысленным.
 *
 * @param error - Пойманная ошибка.
 * @returns Найденная ошибка лимита времени или null.
 */
function findStatementTimeoutError(error: unknown): BricksStatementTimeoutError | null {
    let current = error;

    for (let depth = 0; depth <= CAUSE_LOOKUP_DEPTH; depth += 1) {
        if (current instanceof BricksStatementTimeoutError) {
            return current;
        }

        if (!(current instanceof Error)) {
            return null;
        }

        current = current.cause;
    }

    return null;
}

/**
 * Перебрасывает h3-ошибки как есть, остальное логирует и заворачивает в 500.
 *
 * Внутреннее сообщение ошибки (pg/адаптеры могут содержать детали SQL и
 * инфраструктуры) наружу не отдаётся: клиент получает generic envelope с
 * `data.errorId`, полная ошибка с тем же errorId уходит в server-лог —
 * корреляция ответа и лога по идентификатору.
 *
 * Исключение — остановка запроса серверным лимитом времени: generic 500 выдавал
 * бы её за внутреннюю поломку, хотя причина известна и повтор осмыслен, поэтому
 * она отдаётся отдельным статусом с машиночитаемым кодом (текст выбирает
 * клиент). 504, а не 503: недоступен не сервис целиком, а upstream не успел
 * ответить в отведённое время.
 *
 * @param error - Пойманная ошибка.
 * @param fallbackMessage - Сообщение для 500-ответа.
 */
export function toHttpError(error: unknown, fallbackMessage: string): never {
    if (error && typeof error === 'object' && 'statusCode' in error) {
        throw error;
    }

    if (findStatementTimeoutError(error)) {
        console.error('[Bricks API] Query cancelled by the server statement timeout:', error);

        throw createError({
            statusCode: 504,
            statusMessage: 'Database statement timeout',
            data: { code: BRICKS_API_ERROR_CODES.statementTimeout },
        });
    }

    const errorId = randomUUID();
    console.error(`[Bricks API] ${fallbackMessage} (errorId=${errorId}):`, error);

    throw createError({
        statusCode: 500,
        statusMessage: fallbackMessage,
        data: { errorId },
    });
}

/**
 * Пробрасывает остановку запроса серверным лимитом времени как готовую
 * HTTP-ошибку; прочие ошибки оставляет вызывающему.
 *
 * Нужен там, где общий `catch` иначе подменил бы её своим статусом и потерял бы
 * машиночитаемый код: middleware авторизации отвечает 503 на любую ошибку
 * хранилища сессий, media-прокси — 500. В database-режиме сессия читается перед
 * КАЖДЫМ защищённым запросом, то есть без этого проброса самый вероятный путь
 * отказа доходил бы до пользователя чужим статусом и англоязычным текстом.
 *
 * @param error - Пойманная ошибка.
 */
export function rethrowStatementTimeoutError(error: unknown): void {
    if (error instanceof BricksStatementTimeoutError) {
        toHttpError(error, 'Database statement timeout');
    }
}

/**
 * Маппит доменные конфликты storage-слоя (create/update страницы) на 409
 * с машиночитаемым `data.code`; остальное — через toHttpError.
 *
 * @param error - Пойманная ошибка.
 * @param fallbackMessage - Сообщение для 500-ответа.
 */
export function toPageHttpError(error: unknown, fallbackMessage: string): never {
    if (error instanceof BricksPageAddressConflictError) {
        throw createError({
            statusCode: 409,
            // Про адрес, а не про имя: уникальна пара `urlPrefix + pagename`, и
            // конфликт мог возникнуть от смены одного префикса. Проволочный код
            // (`PAGENAME_CONFLICT`) остаётся прежним — он часть внешнего контракта
            statusMessage: 'Page with this address already exists',
            data: { code: PAGE_CONFLICT_CODES.pagename },
        });
    }

    if (error instanceof BricksRevisionConflictError) {
        throw createError({
            statusCode: 409,
            statusMessage: 'Page was modified by someone else. Refresh and try again',
            data: { code: PAGE_CONFLICT_CODES.revision },
        });
    }

    toHttpError(error, fallbackMessage);
}

/**
 * Маппит отсутствующую категорию медиа на 400 с машиночитаемым `data.code`;
 * остальное — через toHttpError.
 *
 * Отдельным помощником, а не веткой общего `toHttpError`: категории — правило
 * одного домена, и знание о нём в маппере всех ручек проекта не к месту.
 * Источник ошибки при этом не важен — ранняя проверка ручки и FK базы, поймавший
 * гонку с удалением категории, дают клиенту один и тот же ответ.
 *
 * @param error - Пойманная ошибка.
 * @param fallbackMessage - Сообщение для 500-ответа.
 */
export function toMediaHttpError(error: unknown, fallbackMessage: string): never {
    if (error instanceof BricksUnknownMediaCategoryError) {
        throw createError({
            statusCode: 400,
            statusMessage: 'Unknown media category',
            data: { code: BRICKS_API_ERROR_CODES.unknownMediaCategory },
        });
    }

    toHttpError(error, fallbackMessage);
}

/**
 * Маппит доменные отказы управления учётками на 409 с машиночитаемым
 * `data.code`; остальное — через toHttpError.
 *
 * 409, а не 403: права у запроса есть, отказано состоянию системы (последний
 * администратор, занятый логин), и клиент показывает разные объяснения — по коду.
 *
 * @param error - Пойманная ошибка.
 * @param fallbackMessage - Сообщение для 500-ответа.
 */
export function toUsersHttpError(error: unknown, fallbackMessage: string): never {
    if (error instanceof BricksLastActiveAdminError) {
        throw createError({
            statusCode: 409,
            statusMessage: 'The last active administrator cannot be demoted, disabled or deleted',
            data: { code: BRICKS_API_ERROR_CODES.lastActiveAdmin },
        });
    }

    if (error instanceof BricksUsernameTakenError) {
        throw createError({
            statusCode: 409,
            statusMessage: 'User with this username already exists',
            data: { code: BRICKS_API_ERROR_CODES.usernameTaken },
        });
    }

    toHttpError(error, fallbackMessage);
}
