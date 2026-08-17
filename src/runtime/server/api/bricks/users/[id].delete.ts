import { createError, defineEventHandler } from 'h3';
import { useBricksAuthAdapter } from '../../../../modules/persistence/server/registry';
import {
    requireNumericId,
    toUsersHttpError,
} from '../../../../modules/persistence/server/utils/handlerHelpers';
import {
    assertAdminRole,
    assertNotSelfTarget,
    assertUserManagementAvailable,
} from '../../../utils/auth/userManagement';

/**
 * DELETE /api/bricks/users/:id — удаляет учётку (admin).
 *
 * Сессии удалённой учётки уходят каскадом внешнего ключа. Отказы: 409
 * `SELF_TARGET_FORBIDDEN` (себя не удалить — иначе один неверный клик отнимает
 * доступ у того, кто его выдаёт), 409 `LAST_ACTIVE_ADMIN`, 404 (учётки нет).
 *
 * Страницы и медиа удалённого автора остаются: авторство в схеме не хранится, и
 * учётка — только вход в систему.
 */
export default defineEventHandler(async (event) => {
    try {
        assertUserManagementAvailable(event);
        assertAdminRole(event);

        const userId = requireNumericId(event);
        assertNotSelfTarget(event, userId);

        const isDeleted = await useBricksAuthAdapter().deleteUser(userId);

        if (!isDeleted) {
            throw createError({ statusCode: 404, statusMessage: 'User not found' });
        }

        return { success: true };
    } catch (error: unknown) {
        toUsersHttpError(error, 'Failed to delete user');
    }
});
