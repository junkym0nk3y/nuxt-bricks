import { createError, defineEventHandler } from 'h3';
import { useRuntimeConfig } from 'nitropack/runtime';
import { useBricksAuthAdapter } from '../../../../modules/persistence/server/registry';
import { toHttpError } from '../../../../modules/persistence/server/utils/handlerHelpers';
import {
    clearSessionCookie,
    getSessionTokenFromCookie,
    hashSessionToken,
} from '../../../utils/auth/sessionCookie';

/**
 * POST /api/bricks/auth/logout — идемпотентный выход (database-режим):
 * удаляет сессию из БД (если cookie есть) и всегда чистит cookie.
 */
export default defineEventHandler(async (event) => {
    try {
        const config = useRuntimeConfig();

        if (config.bricksAuthMode !== 'database') {
            throw createError({ statusCode: 404, statusMessage: 'Not Found' });
        }

        const token = getSessionTokenFromCookie(event);

        if (token) {
            await useBricksAuthAdapter().deleteSession(hashSessionToken(token));
        }

        clearSessionCookie(event);

        return { ok: true };
    } catch (error: unknown) {
        toHttpError(error, 'Failed to log out');
    }
});
