import { createError, defineEventHandler } from 'h3';
import { useRuntimeConfig } from 'nitropack/runtime';
import { toHttpError } from '../../../../modules/persistence/server/utils/handlerHelpers';
import { resolveSessionUser } from '../../../utils/auth/session';

/**
 * GET /api/bricks/auth/me — текущий пользователь сессии (database-режим).
 * Используется только login-страницей (гвард «уже авторизован»);
 * 401-интерцептор клиента пропускает /bricks/login — петли нет.
 */
export default defineEventHandler(async (event) => {
    try {
        const config = useRuntimeConfig();

        if (config.bricksAuthMode !== 'database') {
            throw createError({ statusCode: 404, statusMessage: 'Not Found' });
        }

        const session = await resolveSessionUser(event);

        if (!session) {
            throw createError({ statusCode: 401, statusMessage: 'Unauthorized' });
        }

        return { user: { id: session.user.id, username: session.user.username } };
    } catch (error: unknown) {
        toHttpError(error, 'Failed to resolve session');
    }
});
