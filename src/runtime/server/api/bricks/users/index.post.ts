import { defineEventHandler } from 'h3';
import { useBricksAuthAdapter } from '../../../../modules/persistence/server/registry';
import {
    readNormalizedBody,
    toUsersHttpError,
} from '../../../../modules/persistence/server/utils/handlerHelpers';
import { BricksUsernameTakenError } from '../../../../modules/persistence/server/utils/authErrors';
import {
    assertUserManagementAvailable,
    buildCreateUserPayload,
    validateCreateUserInput,
} from '../../../utils/auth/userManagement';
import {
    BRICKS_USER_CREATE_LEASE_MS,
    buildUserCreateFingerprint,
    requireUserCreateOperationKey,
    throwUserCreateClaimError,
} from '../../../utils/auth/userCreateOperations';

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
 *
 * Every request carries an operation key of the CLIENT'S making
 * (`Idempotency-Key`), and the order of the steps below is the point of the whole
 * protocol:
 *
 * 1. The body is validated BEFORE the key is claimed — an invalid request must not
 *    burn a key, otherwise a corrected repeat would be answered "this key was used
 *    with a different body".
 * 2. The key is claimed BEFORE the hash is computed. The derivation is the slow step
 *    (seconds of CPU under a shared semaphore), so a repeat sent during the first
 *    attempt has to be recognized before it starts paying for a second one — and the
 *    answer to it is a definite "the first attempt is still running" rather than a
 *    guess.
 * 3. The account and the closing of the operation are written together by the
 *    adapter. A two-step write would bring back the very defect the key closes: a
 *    process dying in between leaves an account nobody can connect to the request.
 *
 * A claim given up on a broken-off attempt (`release`) is not a nicety: without it a
 * client whose request died on the busy-server refusal would be told "the first
 * attempt is still running" until the lease ran out, while nothing is running at all.
 */
export default defineEventHandler(async (event) => {
    try {
        assertUserManagementAvailable(event);

        const idempotencyKey = requireUserCreateOperationKey(event);
        const input = validateCreateUserInput(
            await readNormalizedBody<Record<string, unknown>>(event)
        );

        const adapter = useBricksAuthAdapter();
        const claim = await adapter.claimUserCreateOperation({
            idempotencyKey,
            requestFingerprint: buildUserCreateFingerprint(input),
            leaseMs: BRICKS_USER_CREATE_LEASE_MS,
        });

        // The answer of the first attempt, replayed. Nothing is created and no hash is
        // computed: this is what turns a repeat after an aborted request from a
        // gamble into a question with an answer
        if (claim.status === 'completed') {
            return { user: claim.user };
        }

        if (claim.status !== 'claimed') {
            throwUserCreateClaimError(claim, input.username);
        }

        const outcome = await (async () => {
            try {
                return await adapter.createUserForOperation({
                    idempotencyKey,
                    attempt: claim.attempt,
                    payload: await buildCreateUserPayload(input),
                });
            } catch (error: unknown) {
                // The claim is given up rather than left to expire: the attempt broke
                // off (the derivation queue overflowed, the connection died) and
                // nothing was written, so a repeat may take the operation over at once.
                //
                // A failure of the release itself must not replace the original error:
                // the client would then be told about the release instead of the honest
                // "the server is busy" or the statement timeout, and the operation stays
                // recoverable anyway — its lease runs out and a repeat takes it over
                try {
                    await adapter.releaseUserCreateOperation({
                        idempotencyKey,
                        attempt: claim.attempt,
                    });
                } catch (releaseError: unknown) {
                    console.error(
                        '[Users] Failed to release the create operation claim:',
                        releaseError
                    );
                }

                throw error;
            }
        })();

        if (outcome.status === 'created') {
            return { user: outcome.user };
        }

        if (outcome.status === 'rejected') {
            throw new BricksUsernameTakenError(input.username);
        }

        // The claim was taken over while the hash was being computed: the lease had
        // run out, somebody else owns the operation, and nothing was written here.
        // The client is told the same thing as any other repeat meeting a live
        // attempt — ask again
        return throwUserCreateClaimError({ status: 'running' }, input.username);
    } catch (error: unknown) {
        toUsersHttpError(error, 'Failed to create user');
    }
});
