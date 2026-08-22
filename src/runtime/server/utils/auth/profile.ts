/**
 * Logic shared by the own-profile handlers (`/api/bricks/users/me/**`):
 * availability, the requesting user, DTO validation and the response projection.
 *
 * The profile lives apart from account management (`userManagement.ts`) not by
 * style but by rights: anyone signed in, a viewer included, edits their own
 * name, photo and password, and the `allowUserManagement` flag does not concern
 * the profile — it is about keeping OTHER people's accounts outside the module.
 * What they share is exactly what is extracted into `userManagement.ts` and
 * reused here: the password bounds, hashing under the semaphore and the gate of
 * the password change flag.
 *
 * There is always exactly one target account here — the one whose session came
 * with the request. These handlers accept no `:id` at all: were they to accept
 * one, "own profile" would become a handler for editing any profile, differing
 * from the admin one only in that someone forgot to close it.
 */
import { createError, type H3Event } from 'h3';
import { useRuntimeConfig } from 'nitropack/runtime';
import {
    BRICKS_DISPLAY_NAME_MAX_LENGTH,
    BRICKS_DISPLAY_NAME_PATTERN,
    BRICKS_PASSWORD_MAX_LENGTH,
} from '../../../modules/common/constants/auth';
import { BRICKS_API_ERROR_CODES } from '../../../modules/common/constants/apiErrors';
import { requirePassword } from './userManagement';
import {
    assertKnownKeys,
    invalid,
    optionalNullableString,
} from '../../../modules/persistence/server/utils/payloadPrimitives';
import type { IAuthSessionUser } from '../../../modules/persistence/types/authAdapters';
import type { IAuthOwnPasswordInput, IAuthProfileInput, IAuthProfileUser } from './types';

/** Keys allowed in the body of editing one's own profile */
const PROFILE_KEYS: ReadonlySet<string> = new Set(['displayName']);

/** Keys allowed in the body of changing one's own password */
const OWN_PASSWORD_KEYS: ReadonlySet<string> = new Set(['currentPassword', 'newPassword']);

/**
 * Refuses when there are no accounts at all: the profile exists only in database
 * mode, while in basic the identity is one for everybody and is set by the
 * environment — there is nothing in it to edit.
 *
 * 404 — the same answer as the auth `me` handler gives outside database mode:
 * from the outside "no such route" and "another mode" are indistinguishable, and
 * there is no point in telling them apart.
 *
 * The `allowUserManagement` flag is NOT checked here: it turns off keeping other
 * people's accounts from the builder, not a person's right to change their own
 * photo. The profile has one flag of its own — `allowPasswordChange` — and it
 * closes the password only.
 *
 * @param event - Request event.
 */
export function assertProfileAvailable(event: H3Event): void {
    const config = useRuntimeConfig(event);

    if (config.bricksAuthMode !== 'database') {
        throw createError({ statusCode: 404, statusMessage: 'Not Found' });
    }
}

/**
 * Returns the session user put in place by the auth middleware.
 *
 * A refusal here is unreachable through the module routes (the profile is
 * protected by the path matrix), but the alternative is reading `id` off
 * `undefined` and ending in a 500 or, worse, applying the edit to the wrong
 * account. Hence "no session" is an explicit 401.
 *
 * @param event - Request event.
 * @returns The user of the authorized session.
 */
export function requireSessionUser(event: H3Event): IAuthSessionUser {
    const user = event.context.bricksUser;

    if (!user) {
        throw createError({ statusCode: 401, statusMessage: 'Unauthorized' });
    }

    return user;
}

/**
 * Account projection for the profile responses and the `me` handler — without
 * the activity flag, the generation and the creation date.
 *
 * One shape for every handler that answers "who am I": had they diverged, the
 * corner of the screen would be left guessing what exactly arrived after the
 * profile was saved.
 *
 * @param user - A session or an account row (any shape carrying these fields).
 * @returns The public projection of the profile.
 */
export function toAuthProfileUser(user: IAuthProfileUser): IAuthProfileUser {
    return {
        id: user.id,
        username: user.username,
        role: user.role,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
    };
}

/**
 * Validates the body of editing one's own profile.
 *
 * ONLY the display name is accepted. The photo link is deliberately absent here:
 * it is set by the avatar handlers, which uploaded the file themselves. Allow it
 * in the body and an arbitrary external address would reach the column, that is
 * a foreign resource loading in the corner of the builder for everyone who sees
 * that account. The username is immutable, and role and activity are not
 * editable on oneself without a second administrator.
 *
 * An empty string equals `null`: a person who erased the name is asking to show
 * the username, not an empty spot.
 *
 * @param body - Normalized request body.
 * @returns The validated edit.
 */
export function validateProfilePayload(body: Record<string, unknown>): IAuthProfileInput {
    assertKnownKeys(body, PROFILE_KEYS);

    const displayName = optionalNullableString(body.displayName, 'displayName', {
        max: BRICKS_DISPLAY_NAME_MAX_LENGTH,
        pattern: BRICKS_DISPLAY_NAME_PATTERN,
        patternHint: 'control characters are not allowed',
    });

    if (displayName === undefined) {
        invalid('Field "displayName" is required');
    }

    return { displayName };
}

/**
 * Validates the body of changing one's own password.
 *
 * The current password is checked only for being non-empty and within the length
 * ceiling: the minimum length must not apply to it — the account password could
 * have been set by a direct database write or by an administrator back when the
 * bound was different, and a "no shorter than eight" requirement would leave such
 * a person unable to change their password at all. The NEW password gets the same
 * bounds as on the admin path (`requirePassword`), the ban on the seed password
 * included: changing to the very same one would put out the default password
 * warning.
 *
 * @param body - Normalized request body.
 * @returns The current and the new password in plaintext.
 */
export function validateOwnPasswordPayload(body: Record<string, unknown>): IAuthOwnPasswordInput {
    assertKnownKeys(body, OWN_PASSWORD_KEYS);

    const { currentPassword } = body;

    if (typeof currentPassword !== 'string' || currentPassword.length === 0) {
        invalid('Field "currentPassword" is required');
    }

    if (currentPassword.length > BRICKS_PASSWORD_MAX_LENGTH) {
        invalid(`Field "currentPassword" must be at most ${BRICKS_PASSWORD_MAX_LENGTH} characters`);
    }

    return { currentPassword, newPassword: requirePassword(body.newPassword, 'newPassword') };
}

/**
 * The "current password did not match" refusal.
 *
 * 400 with a machine-readable code rather than 401: the client interceptor reacts
 * to the status and not to the path, and a 401 would drag a person with a working
 * session to the login form — instead of a hint under one field of the form.
 */
export function invalidCurrentPassword(): never {
    throw createError({
        statusCode: 400,
        statusMessage: 'Current password is incorrect',
        data: { code: BRICKS_API_ERROR_CODES.invalidCurrentPassword },
    });
}
