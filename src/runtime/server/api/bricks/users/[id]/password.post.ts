import { createError, defineEventHandler } from 'h3';
import { useBricksAuthAdapter } from '../../../../../modules/persistence/server/registry';
import {
    readNormalizedBody,
    requireNumericId,
    toUsersHttpError,
} from '../../../../../modules/persistence/server/utils/handlerHelpers';
import {
    assertAdminRole,
    assertNotSelfTarget,
    assertUserManagementAvailable,
    buildUserPasswordHash,
} from '../../../../utils/auth/userManagement';

/**
 * POST /api/bricks/users/:id/password — задаёт пароль чужой учётке (admin).
 *
 * Текущий пароль НЕ спрашивается: администратор его не знает, а сценарий —
 * восстановление доступа человеку, который свой пароль забыл. Именно поэтому
 * ручка отказывает на собственной учётке (409 `SELF_TARGET_FORBIDDEN`): свой
 * пароль меняется ручкой профиля, где текущий обязателен, иначе украденная кука
 * администратора сменила бы пароль сама и заперла владельца.
 *
 * Успешная смена рвёт все сессии учётки (инкремент поколения в адаптере).
 * Ответ — без тела учётки: клиенту после смены пароля обновлять в строке нечего.
 */
export default defineEventHandler(async (event) => {
    try {
        assertUserManagementAvailable(event);
        assertAdminRole(event);

        const userId = requireNumericId(event);
        assertNotSelfTarget(event, userId);

        const passwordHash = await buildUserPasswordHash(
            await readNormalizedBody<Record<string, unknown>>(event)
        );
        const user = await useBricksAuthAdapter().updateUserPassword(userId, passwordHash);

        if (!user) {
            throw createError({ statusCode: 404, statusMessage: 'User not found' });
        }

        return { success: true };
    } catch (error: unknown) {
        toUsersHttpError(error, 'Failed to update user password');
    }
});
