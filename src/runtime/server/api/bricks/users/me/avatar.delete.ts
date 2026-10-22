import { createError, defineEventHandler } from 'h3';
import {
    useBricksAuthAdapter,
    useBricksPublishAdapter,
} from '../../../../../modules/persistence/server/registry';
import { discardAvatarFile } from '../../../../../modules/persistence/server/utils/avatarFiles';
import { toHttpError } from '../../../../../modules/persistence/server/utils/handlerHelpers';
import {
    assertProfileAvailable,
    requireSessionUser,
    toAuthProfileUser,
} from '../../../../utils/auth/profile';

/**
 * DELETE /api/bricks/users/me/avatar — removes the photo of one's own profile
 * (any role).
 *
 * Idempotent: an account without a photo has nothing to remove and gets the same
 * answer — there is no point in making the interface tell "removed" from "there
 * was none".
 *
 * The order is the same as on upload: the link is cleared first, the file removed
 * after. The reverse order would leave the account pointing at a deleted object
 * should the write fail.
 */
export default defineEventHandler(async (event) => {
    try {
        assertProfileAvailable(event);

        const sessionUser = requireSessionUser(event);
        const result = await useBricksAuthAdapter().updateUserProfile(
            sessionUser.id,
            { avatarUrl: null },
            sessionUser.authVersion
        );

        // There is no account with these credentials any more (deleted, disabled,
        // or the credential generation was raised) — the session is dead, and that
        // is a 401, not a "no such handler"
        if (!result) {
            throw createError({ statusCode: 401, statusMessage: 'Unauthorized' });
        }

        await discardAvatarFile(useBricksPublishAdapter(), result.previousAvatarUrl, {
            repeatOnFailure: true,
        });

        return { user: toAuthProfileUser(result.user) };
    } catch (error: unknown) {
        toHttpError(error, 'Failed to delete avatar');
    }
});
