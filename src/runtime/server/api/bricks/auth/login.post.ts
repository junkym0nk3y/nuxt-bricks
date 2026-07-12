import { createError, defineEventHandler, setResponseHeader } from 'h3';
import { useRuntimeConfig } from 'nitropack/runtime';
import { useBricksAuthAdapter } from '../../../../modules/persistence/server/registry';
import {
    readNormalizedBody,
    toHttpError,
} from '../../../../modules/persistence/server/utils/handlerHelpers';
import { verifyPassword, DUMMY_PASSWORD_HASH } from '../../../utils/auth/passwords';
import {
    buildRateLimitKey,
    isIpLockedOut,
    isLockedOut,
    registerFailure,
    registerIpFailure,
    resetFailures,
} from '../../../utils/auth/loginRateLimiter';
import { GateOverflowError, runScryptTask } from '../../../utils/auth/scryptGate';
import {
    generateSessionToken,
    hashSessionToken,
    resolveSessionMaxAgeSeconds,
    setSessionCookie,
} from '../../../utils/auth/sessionCookie';
import { resolveRequestClientIp } from '../../../utils/requestClientIp';
import type { IAuthAdapter } from '../../../../modules/persistence/types/adapters';

/** Максимальная длина username (равна VARCHAR(255) в БД). */
const MAX_USERNAME_LENGTH = 255;
/** Максимальная длина пароля (санитарная граница против DoS scrypt'ом). */
const MAX_PASSWORD_LENGTH = 1024;

/** Тело запроса логина. */
interface ILoginBody {
    username?: unknown;
    password?: unknown;
}

/**
 * Валидирует тело логина; 400 — если поля отсутствуют или выходят за границы.
 */
function validateLoginBody(body: ILoginBody): { username: string; password: string } {
    const { username, password } = body;

    if (
        typeof username !== 'string' ||
        typeof password !== 'string' ||
        username.length === 0 ||
        password.length === 0 ||
        username.length > MAX_USERNAME_LENGTH ||
        password.length > MAX_PASSWORD_LENGTH
    ) {
        throw createError({
            statusCode: 400,
            statusMessage: 'Username and password are required',
        });
    }

    return { username, password };
}

/**
 * Проверяет креденшелы: verify всегда выполняется (против DUMMY_PASSWORD_HASH
 * при неизвестном username) — выравнивание тайминга, анти-enumeration.
 */
async function verifyCredentials(
    auth: IAuthAdapter,
    username: string,
    password: string
): Promise<{ id: number; username: string } | null> {
    const user = await auth.getUserByUsername(username);
    const isPasswordValid = await runScryptTask(() =>
        verifyPassword(password, user?.passwordHash ?? DUMMY_PASSWORD_HASH)
    );

    if (!user || !isPasswordValid || !user.isActive) {
        return null;
    }

    return { id: user.id, username: user.username };
}

/**
 * POST /api/bricks/auth/login — вход по username/password (database-режим).
 * Успех: создаёт cookie-сессию и возвращает { user: { id, username } }.
 * Неуспех — единый 401 'Invalid credentials' (нет юзера / неверный пароль /
 * деактивирован). Двухуровневый rate limit (аудит A-04): 5 неудач за 15 минут
 * по ip|username, 30 неудач за то же окно по IP (сменяемые username) → 429 c
 * Retry-After; IP-lockout проверяется до scrypt. scrypt-верификация — под
 * bounded-семафором (`scryptGate`), переполнение очереди → 503.
 */
export default defineEventHandler(async (event) => {
    try {
        const config = useRuntimeConfig();

        if (config.bricksAuthMode !== 'database') {
            throw createError({ statusCode: 404, statusMessage: 'Not Found' });
        }

        const body = await readNormalizedBody<ILoginBody>(event);
        const { username, password } = validateLoginBody(body);

        const clientIp = resolveRequestClientIp(event);
        const ipLockoutSeconds = isIpLockedOut(clientIp);

        if (ipLockoutSeconds > 0) {
            setResponseHeader(event, 'Retry-After', ipLockoutSeconds);
            throw createError({
                statusCode: 429,
                statusMessage: 'Too many login attempts',
            });
        }

        const rateLimitKey = buildRateLimitKey(clientIp, username);
        const lockoutSeconds = isLockedOut(rateLimitKey);

        if (lockoutSeconds > 0) {
            setResponseHeader(event, 'Retry-After', lockoutSeconds);
            throw createError({
                statusCode: 429,
                statusMessage: 'Too many login attempts',
            });
        }

        const auth = useBricksAuthAdapter();
        let user;

        try {
            user = await verifyCredentials(auth, username, password);
        } catch (error: unknown) {
            if (error instanceof GateOverflowError) {
                throw createError({
                    statusCode: 503,
                    statusMessage: 'Server is busy, try again later',
                });
            }

            throw error;
        }

        if (!user) {
            registerFailure(rateLimitKey);
            registerIpFailure(clientIp);
            throw createError({ statusCode: 401, statusMessage: 'Invalid credentials' });
        }

        resetFailures(rateLimitKey);

        try {
            await auth.deleteExpiredSessions();
        } catch (error: unknown) {
            // Сбой уборки не должен валить логин
            console.error('[nuxt-bricks] Failed to delete expired sessions:', error);
        }

        const maxAgeSeconds = resolveSessionMaxAgeSeconds();
        const token = generateSessionToken();

        await auth.createSession({
            tokenHash: hashSessionToken(token),
            userId: user.id,
            expiresAt: new Date(Date.now() + maxAgeSeconds * 1000),
        });

        setSessionCookie(event, token, maxAgeSeconds);

        return { user };
    } catch (error: unknown) {
        toHttpError(error, 'Failed to log in');
    }
});
