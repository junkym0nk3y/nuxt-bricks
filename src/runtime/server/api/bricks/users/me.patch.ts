import { createError, defineEventHandler } from 'h3';
import { useBricksAuthAdapter } from '../../../../modules/persistence/server/registry';
import {
    readNormalizedBody,
    toHttpError,
} from '../../../../modules/persistence/server/utils/handlerHelpers';
import {
    assertProfileAvailable,
    requireSessionUser,
    toAuthProfileUser,
    validateProfilePayload,
} from '../../../utils/auth/profile';

/**
 * PATCH /api/bricks/users/me — the display name of one's own profile.
 *
 * Available to anyone signed in, `viewer` included: their own name and photo are
 * the only things a viewer can change at all. The `allowUserManagement` flag does
 * not concern the profile — it is about keeping OTHER people's accounts outside
 * the module.
 *
 * The target account is taken from the session rather than from the path: an
 * `:id` parameter would turn "own profile" into editing any profile, differing
 * from the admin handler only in that someone forgot to close it. The username
 * stays immutable, role and activity are not editable on oneself, and the photo
 * link is set by the avatar handlers only — otherwise an arbitrary external
 * address would reach the column.
 *
 * Sessions are NOT broken: a name is not a credential, and a rename that throws
 * a person out of their session is not what they asked for. But the write itself
 * is conditional on the credential generation from the session: during the
 * request an administrator could have deactivated the account or reset its
 * password, and the edit must not land with already revoked credentials.
 */
export default defineEventHandler(async (event) => {
    try {
        assertProfileAvailable(event);

        const sessionUser = requireSessionUser(event);
        const change = validateProfilePayload(
            await readNormalizedBody<Record<string, unknown>>(event)
        );
        const result = await useBricksAuthAdapter().updateUserProfile(
            sessionUser.id,
            change,
            sessionUser.authVersion
        );

        // There is no live account with these credentials any more: deleted,
        // disabled, or the credential generation was raised. The answer is 401 —
        // the session is already dead and the client will go to the login form on
        // its own; a 404 would claim that the handler itself does not exist
        if (!result) {
            throw createError({ statusCode: 401, statusMessage: 'Unauthorized' });
        }

        return { user: toAuthProfileUser(result.user) };
    } catch (error: unknown) {
        toHttpError(error, 'Failed to update profile');
    }
});
