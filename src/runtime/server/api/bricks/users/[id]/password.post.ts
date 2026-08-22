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
    assertPasswordChangeAllowed,
    assertUserManagementAvailable,
    buildUserPasswordHash,
} from '../../../../utils/auth/userManagement';

/**
 * POST /api/bricks/users/:id/password — sets the password of someone else's
 * account (admin).
 *
 * The current password is NOT asked for: the administrator does not know it, and
 * the scenario is restoring access for a person who forgot their own password.
 * That is exactly why the handler refuses on the caller's own account (409
 * `SELF_TARGET_FORBIDDEN`): one's own password is changed by the profile handler,
 * where the current one is mandatory — otherwise a stolen administrator cookie
 * would change the password on its own and lock the owner out.
 *
 * A successful change breaks every session of the account (the generation is
 * incremented in the adapter). The response carries no account body: after a
 * password change the client has nothing to refresh in the row.
 *
 * The `allowPasswordChange` flag closes this handler exactly as it closes the
 * own-password one (403 `PASSWORD_CHANGE_DISABLED`): an installation that keeps
 * passwords outside the module would otherwise be left with one loophole out of
 * two. The check comes AFTER the role — the state of the flag must not be visible
 * to someone who has no rights to the section.
 */
export default defineEventHandler(async (event) => {
    try {
        assertUserManagementAvailable(event);
        assertAdminRole(event);
        assertPasswordChangeAllowed(event);

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
