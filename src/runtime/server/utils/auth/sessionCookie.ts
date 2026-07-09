/**
 * Cookie-сессии database-auth: генерация/хеширование opaque-токена и работа
 * с HttpOnly cookie `bricks-session`.
 *
 * В cookie — токен (32 байта base64url), в БД — только его SHA-256 hex:
 * утечка дампа БД не даёт готовых токенов, session-secret не нужен.
 */
import { createHash, randomBytes } from 'node:crypto';
import { getCookie, setCookie, deleteCookie, type H3Event } from 'h3';
import { useRuntimeConfig } from 'nitropack/runtime';

/** Имя cookie сессии. */
export const SESSION_COOKIE_NAME = 'bricks-session';

/** Дефолтный срок жизни сессии — 7 дней (зеркалит дефолт опции модуля). */
const DEFAULT_SESSION_MAX_AGE_SECONDS = 604800;

/**
 * Генерирует opaque-токен сессии (32 байта, base64url).
 */
export function generateSessionToken(): string {
    return randomBytes(32).toString('base64url');
}

/**
 * Возвращает SHA-256 hex токена — ключ сессии в БД.
 */
export function hashSessionToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
}

/**
 * Возвращает срок жизни сессии в секундах из runtimeConfig
 * (env-значение приходит строкой — приводится к числу).
 */
export function resolveSessionMaxAgeSeconds(): number {
    const config = useRuntimeConfig();
    const raw = config.bricksAuthSessionMaxAge as number | string | undefined;
    const maxAge = Number(raw);

    return Number.isFinite(maxAge) && maxAge > 0 ? maxAge : DEFAULT_SESSION_MAX_AGE_SECONDS;
}

/**
 * Читает токен сессии из cookie запроса.
 */
export function getSessionTokenFromCookie(event: H3Event): string | null {
    return getCookie(event, SESSION_COOKIE_NAME) ?? null;
}

/**
 * Ставит HttpOnly cookie сессии (SameSite=Lax, Secure в production, path=/).
 *
 * @param event - Событие запроса.
 * @param token - Opaque-токен (не хеш).
 * @param maxAgeSeconds - Срок жизни cookie в секундах.
 */
export function setSessionCookie(event: H3Event, token: string, maxAgeSeconds: number): void {
    setCookie(event, SESSION_COOKIE_NAME, token, {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        maxAge: maxAgeSeconds,
    });
}

/**
 * Удаляет cookie сессии (logout / невалидная сессия).
 */
export function clearSessionCookie(event: H3Event): void {
    deleteCookie(event, SESSION_COOKIE_NAME, { path: '/' });
}
