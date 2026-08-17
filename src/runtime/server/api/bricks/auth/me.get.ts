import { createError, defineEventHandler } from 'h3';
import { useRuntimeConfig } from 'nitropack/runtime';
import { toHttpError } from '../../../../modules/persistence/server/utils/handlerHelpers';
import { resolveSessionUser } from '../../../utils/auth/session';
import { toAuthProfileUser } from '../../../utils/auth/profile';

/**
 * GET /api/bricks/auth/me — текущий пользователь сессии (database-режим).
 * Используется login-страницей (гвард «уже авторизован») и композиционными
 * корнями билдера и дашборда, которые по роли решают, какие действия вообще
 * показывать; 401-интерцептор клиента пропускает страницу логина — петли нет.
 *
 * Проекция общая с ручками профиля (`toAuthProfileUser`): угол экрана
 * наполняется этим ответом и обновляется ответами профиля, и две разные формы
 * заставили бы его угадывать, что именно приехало.
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

        return { user: toAuthProfileUser(session.user) };
    } catch (error: unknown) {
        toHttpError(error, 'Failed to resolve session');
    }
});
