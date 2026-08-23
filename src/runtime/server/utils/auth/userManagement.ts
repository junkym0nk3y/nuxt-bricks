/**
 * Logic shared by the `/api/bricks/users/**` handlers: availability of the
 * section, the administrator role requirement, the ban on operating on oneself
 * and DTO validation.
 *
 * There is still no second parser of PATHS here: matching a route against the
 * required right stays with the auth middleware (`rolePolicy.ts`), because two
 * parsers would inevitably diverge at the edges — such a gap has already
 * allowed the guard to be bypassed with an encoded path. `assertAdminRole`
 * parses no paths at all: the handler calling it is the admin handler itself,
 * and the role is read from the request context put there by that same
 * middleware.
 */
import { createError, type H3Event } from 'h3';
import { useRuntimeConfig } from 'nitropack/runtime';
import {
    BRICKS_DEFAULT_ADMIN_PASSWORD,
    BRICKS_DISPLAY_NAME_MAX_LENGTH,
    BRICKS_DISPLAY_NAME_PATTERN,
    BRICKS_NEW_USERNAME_MAX_LENGTH,
    BRICKS_NEW_USERNAME_MIN_LENGTH,
    BRICKS_NEW_USERNAME_PATTERN,
    BRICKS_PASSWORD_MAX_LENGTH,
    BRICKS_PASSWORD_MIN_LENGTH,
    BRICKS_ROLE_RANK,
} from '../../../modules/common/constants/auth';
import { BRICKS_API_ERROR_CODES } from '../../../modules/common/constants/apiErrors';
import {
    isAccessSatisfied,
    isPasswordChangeAvailable,
    isUserManagementAvailable,
} from './rolePolicy';
import {
    assertKnownKeys,
    invalid,
    optionalBoolean,
    optionalNullableString,
    requireString,
} from '../../../modules/persistence/server/utils/payloadPrimitives';
import { runScryptTask, GateOverflowError } from './scryptGate';
import { hashPassword } from './passwords';
import type { TBricksUserRole } from '../../../modules/common/types/auth';
import type {
    IAuthUserStateChange,
    ICreateAuthUserPayload,
} from '../../../modules/persistence/types/authAdapters';
import type { IAuthUserCreateInput } from './types';

/** Keys allowed in the account creation body */
const CREATE_USER_KEYS: ReadonlySet<string> = new Set([
    'username',
    'password',
    'role',
    'displayName',
    'isActive',
]);

/** Keys allowed in the body of an administrator editing an account */
const UPDATE_USER_KEYS: ReadonlySet<string> = new Set(['role', 'isActive']);

/** Keys allowed in the body of changing someone else's password */
const PASSWORD_KEYS: ReadonlySet<string> = new Set(['password']);

/**
 * Checks that the value is a known role. The keys of `BRICKS_ROLE_RANK` are
 * typed as `string`, so the check runs against the rank object itself: a
 * separate list of roles next to it would diverge silently.
 *
 * @param value - Raw field value.
 */
function isBricksUserRole(value: unknown): value is TBricksUserRole {
    return typeof value === 'string' && Object.hasOwn(BRICKS_ROLE_RANK, value);
}

/**
 * Requires a role in the request body; 400 if the value is not a role.
 *
 * @param value - Raw field value.
 * @param field - Field name for the error message.
 */
function requireRole(value: unknown, field: string): TBricksUserRole {
    if (!isBricksUserRole(value)) {
        invalid(`Field "${field}" must be one of: ${Object.keys(BRICKS_ROLE_RANK).join(', ')}`);
    }

    return value;
}

/**
 * Checks the password as a string within the allowed bounds. Whitespace is NOT
 * trimmed: a space is a legitimate password character, and `trim` would change
 * what the person typed (the trimmed password would then fail at sign-in).
 *
 * Exported to the own-profile handlers deliberately: the bounds of a new
 * password must match on both change paths — otherwise the profile would accept
 * a password an administrator cannot set, and the minimum length would stop
 * meaning anything.
 *
 * @param value - Raw field value.
 * @param field - Field name for the error message: for one's own password it is
 * `newPassword`, and a generic "password" would put the form hint under the
 * wrong field.
 * @returns The plaintext password.
 */
export function requirePassword(value: unknown, field = 'password'): string {
    if (typeof value !== 'string') {
        invalid(`Field "${field}" must be a string`);
    }

    // The seed default password is forbidden to anyone: it is the same in every
    // installation and printed in the README. Without this ban a person could
    // "change" the password to the very same one — the default password warning
    // would go out (it recognizes the default by its hash, and a new record gets
    // its own salt), while the account stayed common knowledge. The same ban
    // closes the reverse path: an administrator cannot hand that password to
    // someone else.
    if (value === BRICKS_DEFAULT_ADMIN_PASSWORD) {
        invalid(`Field "${field}" must not be the default password`);
    }

    if (value.length < BRICKS_PASSWORD_MIN_LENGTH) {
        invalid(`Field "${field}" must be at least ${BRICKS_PASSWORD_MIN_LENGTH} characters`);
    }

    if (value.length > BRICKS_PASSWORD_MAX_LENGTH) {
        invalid(`Field "${field}" must be at most ${BRICKS_PASSWORD_MAX_LENGTH} characters`);
    }

    return value;
}

/**
 * Brings the username to its canonical form and checks the format.
 *
 * Case is dropped BEFORE the format check: uniqueness is held by an index on
 * `lower(username)`, sign-in is case-insensitive, and `Ivan` and `ivan` are one
 * account. Storing the typed case would mean showing a name in the list that
 * differs from what people actually sign in with.
 *
 * @param value - Raw field value.
 * @returns The lowercase username.
 */
function requireUsername(value: unknown): string {
    const raw = requireString(value, 'username', {
        min: BRICKS_NEW_USERNAME_MIN_LENGTH,
        max: BRICKS_NEW_USERNAME_MAX_LENGTH,
    });

    return requireString(raw.toLowerCase(), 'username', {
        min: BRICKS_NEW_USERNAME_MIN_LENGTH,
        max: BRICKS_NEW_USERNAME_MAX_LENGTH,
        pattern: BRICKS_NEW_USERNAME_PATTERN,
        patternHint: 'latin letters, digits and . _ @ + - are allowed',
    });
}

/**
 * Computes the scrypt hash under the shared semaphore; queue overflow is 503
 * (the same answer as at login: the server is busy, retrying makes sense).
 *
 * Through the semaphore rather than directly: a derivation takes seconds of CPU,
 * and a burst of account creations would otherwise starve sign-ins of the
 * processor. For the same reason the profile handlers go through it too — the
 * semaphore is shared by every scrypt derivation in the process.
 *
 * @param password - The plaintext password.
 */
export async function hashPasswordUnderGate(password: string): Promise<string> {
    try {
        return await runScryptTask(() => hashPassword(password));
    } catch (error: unknown) {
        if (error instanceof GateOverflowError) {
            throw createError({
                statusCode: 503,
                statusMessage: 'Server is busy, try again later',
            });
        }

        throw error;
    }
}

/**
 * Refuses when account management is unavailable: not database mode, or turned
 * off by the `auth.allowUserManagement` option.
 *
 * 404, not 403: a 403 would confirm that the section is in the build and merely
 * closed to the administrator. Both reasons answer the same on purpose — from
 * the outside they are indistinguishable.
 *
 * A second line of defense: the same 404 is served first by the auth
 * middleware, before the role guard and the CSRF gate — otherwise a disabled
 * section would give itself away with foreign statuses (403 to an editor, 401 to
 * an anonymous caller). The check stays here for a handler registered outside
 * the path matrix of the middleware.
 *
 * @param event - Request event.
 */
export function assertUserManagementAvailable(event: H3Event): void {
    const config = useRuntimeConfig(event);

    if (!isUserManagementAvailable(config.bricksAuthMode, config.bricksAuthAllowUserManagement)) {
        throw createError({ statusCode: 404, statusMessage: 'Not Found' });
    }
}

/**
 * Refuses when password change is turned off by the `auth.allowPasswordChange`
 * option.
 *
 * 403 with a machine-readable code rather than the 404 of the account section:
 * that the installation has passwords is obvious anyway (people sign in with
 * them), there is nothing to hide, and the client has to tell "turned off by a
 * setting" from "no rights" — for the latter it would suggest retrying under a
 * different account.
 *
 * One check for two handlers (one's own password and someone else's): an
 * installation that keeps passwords outside the module would otherwise be left
 * with one loophole out of two.
 *
 * @param event - Request event.
 */
export function assertPasswordChangeAllowed(event: H3Event): void {
    const config = useRuntimeConfig(event);

    if (isPasswordChangeAvailable(config.bricksAuthMode, config.bricksAuthAllowPasswordChange)) {
        return;
    }

    throw createError({
        statusCode: 403,
        statusMessage: 'Password change is disabled',
        data: { code: BRICKS_API_ERROR_CODES.passwordChangeDisabled },
    });
}

/**
 * Requires the administrator role of an already authenticated request.
 *
 * Duplicating the role guard of the middleware is deliberate, and not for the
 * sake of "just in case": handlers with an `:id` parameter also match paths under
 * `/users/me`, whose exact "method + path" pairs the access matrix relaxes to any
 * session. Only the pairs that have a static handler of their own are routed away
 * from here — `DELETE /api/bricks/users/me` has none and lands in
 * `[id].delete.ts`. Add a route to the relaxed list without a static handler and
 * the only obstacle left would be how `:id` parses: a coincidence, not an access
 * right. The role is read from the context put there by the middleware, so the
 * check does not depend on how the path parsed.
 *
 * @param event - Request event.
 */
export function assertAdminRole(event: H3Event): void {
    const role = event.context.bricksUser?.role;

    if (role && isAccessSatisfied(role, 'admin')) {
        return;
    }

    throw createError({
        statusCode: 403,
        statusMessage: 'Insufficient role',
        data: { code: BRICKS_API_ERROR_CODES.insufficientRole },
    });
}

/**
 * Refuses when the request targets the caller's own account.
 *
 * The reason is not convenience: the admin password handler does not ask for the
 * current password (an administrator setting a password for someone else has no
 * reason to know it), while the own-profile handler does — otherwise a stolen
 * cookie changes the password on its own and locks the owner out. Allow the
 * admin path against oneself and that requirement is bypassed in a single
 * request. Role and activity are not editable on oneself for the same reason:
 * one's own rights must not change without a second administrator.
 *
 * @param event - Request event.
 * @param targetUserId - Identifier of the target account.
 */
export function assertNotSelfTarget(event: H3Event, targetUserId: number): void {
    if (event.context.bricksUser?.id !== targetUserId) {
        return;
    }

    throw createError({
        statusCode: 409,
        statusMessage: 'Use the profile endpoints to change your own account',
        data: { code: BRICKS_API_ERROR_CODES.selfTargetForbidden },
    });
}

/**
 * Validates the account creation body. The password stays plaintext here: hashing is
 * the slow step, and it must not start before the operation key has been claimed —
 * otherwise a repeat sent during the first attempt pays for a second derivation
 * exactly when the server is already busy with the first.
 *
 * The display name and the activity flag are optional and are resolved here
 * rather than in the adapter: `undefined` would reach the INSERT as NULL, and
 * `is_active` is declared NOT NULL — the table default does not apply at all
 * once a value is given explicitly. An empty name string equals no name — it is
 * a request to show the username, the same reading as when editing one's own
 * profile.
 *
 * The name is set ONLY at creation, after which people edit it themselves
 * (`PATCH /users/me`): an administrator fills the list with readable names
 * before new people first sign in, but cannot rewrite someone else's signature
 * afterwards.
 *
 * @param body - Normalized request body.
 * @returns The validated fields of the creation.
 */
export function validateCreateUserInput(body: Record<string, unknown>): IAuthUserCreateInput {
    assertKnownKeys(body, CREATE_USER_KEYS);

    const username = requireUsername(body.username);
    const password = requirePassword(body.password);
    const role = requireRole(body.role, 'role');
    const displayName = optionalNullableString(body.displayName, 'displayName', {
        max: BRICKS_DISPLAY_NAME_MAX_LENGTH,
        pattern: BRICKS_DISPLAY_NAME_PATTERN,
        patternHint: 'control characters are not allowed',
    });

    return {
        username,
        password,
        role,
        displayName: displayName ?? null,
        isActive: optionalBoolean(body.isActive, 'isActive') ?? true,
    };
}

/**
 * Turns the validated fields into the adapter's payload: the plaintext password is
 * replaced by its hash, and the adapter never sees the plaintext at all.
 *
 * @param input - The validated creation fields.
 * @returns Data for the adapter.
 */
export async function buildCreateUserPayload(
    input: IAuthUserCreateInput
): Promise<ICreateAuthUserPayload> {
    return {
        username: input.username,
        role: input.role,
        displayName: input.displayName,
        isActive: input.isActive,
        passwordHash: await hashPasswordUnderGate(input.password),
    };
}

/**
 * Validates the account edit body: role and/or activity, at least one field.
 *
 * @param body - Normalized request body.
 */
export function validateUpdateUserPayload(body: Record<string, unknown>): IAuthUserStateChange {
    assertKnownKeys(body, UPDATE_USER_KEYS);

    const role = body.role === undefined ? undefined : requireRole(body.role, 'role');
    const isActive = optionalBoolean(body.isActive, 'isActive');

    if (role === undefined && isActive === undefined) {
        invalid('At least one of "role" or "isActive" is required');
    }

    return { role, isActive };
}

/**
 * Validates the body of changing someone else's password and hashes it.
 *
 * @param body - Normalized request body.
 * @returns The password hash for the adapter.
 */
export async function buildUserPasswordHash(body: Record<string, unknown>): Promise<string> {
    assertKnownKeys(body, PASSWORD_KEYS);

    return hashPasswordUnderGate(requirePassword(body.password));
}
