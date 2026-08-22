import { defineEventHandler } from 'h3';
import { useBricksAuthAdapter } from '../../../../modules/persistence/server/registry';
import {
    readNormalizedBody,
    toUsersHttpError,
} from '../../../../modules/persistence/server/utils/handlerHelpers';
import {
    assertUserManagementAvailable,
    buildCreateUserPayload,
} from '../../../utils/auth/userManagement';

/**
 * POST /api/bricks/users — creates an account (admin).
 *
 * The username is canonicalized to lower case, and the password reaches the
 * database as a hash only (scrypt under the shared semaphore). A taken username
 * is a 409 with the code `USERNAME_TAKEN`: the form puts a hint under the field
 * instead of a generic error text.
 *
 * The display name and the activity flag are optional: without them the account
 * is active and shown by its username. The administrator sets the name only HERE
 * — the list has to be readable before new people first sign in; afterwards
 * people edit their own signature through the profile handler, and the
 * administrator can no longer rewrite it. An account created switched off gives
 * no way in until it is switched on from the row of the list.
 */
export default defineEventHandler(async (event) => {
    try {
        assertUserManagementAvailable(event);

        const payload = await buildCreateUserPayload(
            await readNormalizedBody<Record<string, unknown>>(event)
        );
        return { user: await useBricksAuthAdapter().createUser(payload) };
    } catch (error: unknown) {
        toUsersHttpError(error, 'Failed to create user');
    }
});
