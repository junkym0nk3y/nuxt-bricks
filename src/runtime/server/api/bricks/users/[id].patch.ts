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
 * PATCH /api/bricks/users/:id — the role and/or the activity of someone else's
 * account (admin).
 *
 * Both fields are applied in one adapter transaction together with the revocation
 * of the account sessions. Refusals: 409 `SELF_TARGET_FORBIDDEN` (one's own
 * account is edited by the profile handlers), 409 `LAST_ACTIVE_ADMIN` (the system
 * would be left with no administrator), 404 (no such account).
 *
 * The role is required explicitly (`assertAdminRole`) even though the middleware
 * requires it too: this route also matches `/api/bricks/users/me`, so relaxing
 * the profile subtree must not turn a non-numeric `:id` into the only obstacle.
 * The parsing of `:id` still happens before any work with the request body.
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
