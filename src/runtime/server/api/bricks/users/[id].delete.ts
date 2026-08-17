import { createError, defineEventHandler } from 'h3';
import {
    useBricksAuthAdapter,
    useBricksPublishAdapter,
} from '../../../../modules/persistence/server/registry';
import { discardAvatarFile } from '../../../../modules/persistence/server/utils/avatarFiles';
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
 * Фото профиля удаляется вслед за учёткой: ссылки на него больше нет нигде, и без
 * уборки файл остался бы в хранилище навсегда. Идёт она best-effort и ПОСЛЕ
 * удаления строки — отказ хранилища не должен превращать успешное удаление
 * учётки в ошибку, повторить которую уже нечем.
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

        const deletedUser = await useBricksAuthAdapter().deleteUser(userId);

        if (!deletedUser) {
            throw createError({ statusCode: 404, statusMessage: 'User not found' });
        }

        await discardAvatarFile(useBricksPublishAdapter(), deletedUser.avatarUrl);

        return { success: true };
    } catch (error: unknown) {
        toUsersHttpError(error, 'Failed to delete user');
    }
});
