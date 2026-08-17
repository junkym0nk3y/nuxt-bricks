import { createError, defineEventHandler } from 'h3';
import { useBricksAuthAdapter } from '../../../../modules/persistence/server/registry';
import {
    readNormalizedBody,
    requireNumericId,
    toUsersHttpError,
} from '../../../../modules/persistence/server/utils/handlerHelpers';
import {
    assertAdminRole,
    assertNotSelfTarget,
    assertUserManagementAvailable,
    validateUpdateUserPayload,
} from '../../../utils/auth/userManagement';

/**
 * PATCH /api/bricks/users/:id — роль и/или активность чужой учётки (admin).
 *
 * Оба поля применяются одной транзакцией адаптера вместе с отзывом сессий
 * учётки. Отказы: 409 `SELF_TARGET_FORBIDDEN` (своя учётка правится ручками
 * профиля), 409 `LAST_ACTIVE_ADMIN` (система осталась бы без администратора),
 * 404 (учётки нет).
 *
 * Роль требуется явно (`assertAdminRole`), хотя её же требует middleware: этим
 * маршрутом матчится и `/api/bricks/users/me`, поэтому послабление для
 * поддерева профиля не должно превращать нечисловой `:id` в единственную
 * преграду. Разбор `:id` при этом остаётся до всякой работы с телом запроса.
 */
export default defineEventHandler(async (event) => {
    try {
        assertUserManagementAvailable(event);
        assertAdminRole(event);

        const userId = requireNumericId(event);
        assertNotSelfTarget(event, userId);

        const change = validateUpdateUserPayload(
            await readNormalizedBody<Record<string, unknown>>(event)
        );
        const user = await useBricksAuthAdapter().updateUserState(userId, change);

        if (!user) {
            throw createError({ statusCode: 404, statusMessage: 'User not found' });
        }

        return { user };
    } catch (error: unknown) {
        toUsersHttpError(error, 'Failed to update user');
    }
});
