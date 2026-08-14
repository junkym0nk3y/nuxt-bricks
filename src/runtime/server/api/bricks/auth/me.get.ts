import { createError, defineEventHandler } from 'h3';
import { useRuntimeConfig } from 'nitropack/runtime';
import { toHttpError } from '../../../../modules/persistence/server/utils/handlerHelpers';
import { resolveSessionUser } from '../../../utils/auth/session';

/**
 * GET /api/bricks/auth/me — текущий пользователь сессии (database-режим).
 * Используется login-страницей (гвард «уже авторизован») и композиционными
 * корнями билдера и дашборда, которые по роли решают, какие действия вообще
 * показывать; 401-интерцептор клиента пропускает страницу логина — петли нет.
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

        return {
            user: {
                id: session.user.id,
                username: session.user.username,
                role: session.user.role,
                displayName: session.user.displayName,
                avatarUrl: session.user.avatarUrl,
            },
        };
    } catch (error: unknown) {
        toHttpError(error, 'Failed to resolve session');
    }
});
