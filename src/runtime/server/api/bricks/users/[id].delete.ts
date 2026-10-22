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
 * DELETE /api/bricks/users/:id — deletes an account (admin).
 *
 * The sessions of a deleted account go away by the foreign key cascade.
 * Refusals: 409 `SELF_TARGET_FORBIDDEN` (one cannot delete oneself — otherwise a
 * single wrong click takes access away from the very person who hands it out),
 * 409 `LAST_ACTIVE_ADMIN`, 404 (no such account).
 *
 * The profile photo is deleted after the account: nothing points at it any more,
 * and without the cleanup the file would stay in the storage forever. The cleanup
 * is best-effort and runs AFTER the row is deleted — a storage failure must not
 * turn a successful account deletion into an error that can no longer be retried.
 *
 * The pages and the media of a deleted author remain: authorship is not stored in
 * the schema, and an account is only a way into the system.
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

        await discardAvatarFile(useBricksPublishAdapter(), deletedUser.avatarUrl, {
            repeatOnFailure: true,
        });

        return { success: true };
    } catch (error: unknown) {
        toUsersHttpError(error, 'Failed to delete user');
    }
});
