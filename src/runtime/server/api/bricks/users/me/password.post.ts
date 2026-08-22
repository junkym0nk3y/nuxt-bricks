import { createError, defineEventHandler } from 'h3';
import { useBricksAuthAdapter } from '../../../../../modules/persistence/server/registry';
import {
    readNormalizedBody,
    toHttpError,
} from '../../../../../modules/persistence/server/utils/handlerHelpers';
import {
    assertProfileAvailable,
    invalidCurrentPassword,
    requireSessionUser,
    validateOwnPasswordPayload,
} from '../../../../utils/auth/profile';
import {
    assertPasswordChangeAllowed,
    hashPasswordUnderGate,
} from '../../../../utils/auth/userManagement';
import { verifyPassword } from '../../../../utils/auth/passwords';
import { GateOverflowError, runScryptTask } from '../../../../utils/auth/scryptGate';
import { clearSessionCookie } from '../../../../utils/auth/sessionCookie';
import {
    assertWithinRateLimit,
    createFixedWindowRateLimiter,
} from '../../../../utils/requestRateLimiter';

/**
 * Limit of own-password change attempts from one IP per minute.
 *
 * It exists because of the CURRENT password: the handler verifies it, that is,
 * it answers the question "is this password correct?". Otherwise a stolen cookie
 * would brute-force the password itself through it — and the person most likely
 * uses that password somewhere else too. The bound also keeps the CPU in check:
 * every attempt is two scrypt derivations.
 */
const PASSWORD_CHANGES_PER_MINUTE = 10;
const passwordChangeRateLimiter = createFixedWindowRateLimiter({
    limit: PASSWORD_CHANGES_PER_MINUTE,
    windowMs: 60_000,
});

/**
 * POST /api/bricks/users/me/password — changing ONE'S OWN password (any role).
 *
 * The current password is mandatory, and that is the main difference from the
 * admin handler: without it a stolen cookie would change the password on its own
 * and lock the owner out. An administrator sets someone else's password without
 * the current one (they do not know it) — which is why that handler refuses on
 * the caller's own account.
 *
 * Success revokes ALL sessions of the account, the one the request came from
 * included: the credential generation is raised by a single UPDATE, and the
 * former sessions stop matching the account. That is by design — if the password
 * is being changed on suspicion of a stolen cookie, a surviving session would
 * void the change. The cookie is cleared in the same response so that the browser
 * does not carry a dead token until its first 401.
 *
 * The write is conditional on the generation read BEFORE the password check: the
 * check spends seconds inside scrypt, and in that time an administrator could
 * have reset the password of this account to take it away. An unconditional write
 * would undo that reset with the old password.
 */
export default defineEventHandler(async (event) => {
    try {
        assertProfileAvailable(event);
        assertPasswordChangeAllowed(event);

        const sessionUser = requireSessionUser(event);

        // After the availability checks: the 404 of a disabled mode and the 403
        // of the flag must not spend the attempt budget
        assertWithinRateLimit(
            event,
            passwordChangeRateLimiter,
            'Too many password change attempts'
        );

        const { currentPassword, newPassword } = validateOwnPasswordPayload(
            await readNormalizedBody<Record<string, unknown>>(event)
        );
        const auth = useBricksAuthAdapter();
        const record = await auth.getUserByUsername(sessionUser.username);

        // The account was deleted, or its username is already held by a different
        // row: both situations mean the session refers to something that no longer
        // exists.
        //
        // The generation is compared against the GENERATION OF THE SESSION rather
        // than taken from the fresh read: a role change raises the generation and
        // revokes the sessions, yet it does not change the password — so the
        // former password still fits, and a write conditional on the
        // freshly read generation would go through from an already revoked
        // session. Deactivation followed by a quick reactivation gave the same
        // bypass. The profile and the avatar count by the session generation for
        // the same reason.
        if (
            !record ||
            record.id !== sessionUser.id ||
            !record.isActive ||
            record.authVersion !== sessionUser.authVersion
        ) {
            throw createError({ statusCode: 401, statusMessage: 'Unauthorized' });
        }

        let isCurrentPasswordValid: boolean;

        try {
            isCurrentPasswordValid = await runScryptTask(() =>
                verifyPassword(currentPassword, record.passwordHash)
            );
        } catch (error: unknown) {
            if (error instanceof GateOverflowError) {
                throw createError({
                    statusCode: 503,
                    statusMessage: 'Server is busy, try again later',
                });
            }

            throw error;
        }

        if (!isCurrentPasswordValid) {
            invalidCurrentPassword();
        }

        const isApplied = await auth.updateOwnPassword(sessionUser.id, {
            passwordHash: await hashPasswordUnderGate(newPassword),
            expectedAuthVersion: sessionUser.authVersion,
        });

        // The state of the account changed while the scrypt checks were running:
        // an administrator reset the password, or the account was disabled. The
        // answer is 401: the session is already dead, and the client will go to
        // the login form, where it becomes clear whose password is in force
        if (!isApplied) {
            throw createError({ statusCode: 401, statusMessage: 'Unauthorized' });
        }

        clearSessionCookie(event);

        return { success: true };
    } catch (error: unknown) {
        toHttpError(error, 'Failed to change password');
    }
});
