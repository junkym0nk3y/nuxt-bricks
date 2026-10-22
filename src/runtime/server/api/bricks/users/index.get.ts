import { defineEventHandler } from 'h3';
import { useBricksAuthAdapter } from '../../../../modules/persistence/server/registry';
import { toUsersHttpError } from '../../../../modules/persistence/server/utils/handlerHelpers';
import { assertUserManagementAvailable } from '../../../utils/auth/userManagement';

/**
 * GET /api/bricks/users — the account list for the Users section (admin).
 *
 * It returns the requester's own account too: the "this is you" row is part of
 * the screen, not a redundant record. There are no secrets in the response
 * (neither the password hash nor the credential generation), so the client never
 * has to filter the fields.
 */
export default defineEventHandler(async (event) => {
    try {
        assertUserManagementAvailable(event);

        return { users: await useBricksAuthAdapter().listUsers() };
    } catch (error: unknown) {
        toUsersHttpError(error, 'Failed to list users');
    }
});
