import type { TBricksUserRole } from '../types/auth';

/**
 * Name of the HttpOnly session cookie of database auth.
 *
 * Lives in common: the server-side session utilities
 * (server/utils/auth/sessionCookie) set and read the cookie, while the filtering
 * of identity headers before proxying to an external backend (useApiClient,
 * proxy middleware) strips it out by name.
 */
export const BRICKS_SESSION_COOKIE_NAME = 'bricks-session';

/**
 * Rank of a role: the higher, the wider the permissions. The roles are strictly
 * nested (viewer ⊂ editor ⊂ admin), so an access check is a comparison of
 * numbers rather than a "role × permission" table that would have to be edited
 * for every new action.
 */
export const BRICKS_ROLE_RANK: Record<TBricksUserRole, number> = {
    viewer: 1,
    editor: 2,
    admin: 3,
};

/**
 * The role attributed to basic mode. It has no accounts at all, the identity is
 * one for everybody and is set by environment variables, so the editorial
 * permissions are granted in full — there is nobody to narrow them for. Account
 * management and the profile are unavailable nonetheless: without database mode
 * they have nothing to work on.
 */
export const BRICKS_BASIC_MODE_ROLE: TBricksUserRole = 'admin';

/**
 * Bounds of the login of a NEW account (creation through `/api/bricks/users`).
 *
 * Separate from the bounds the sign-in accepts (`auth/login.post.ts`, up to 255
 * characters — the column length): the login of an already existing account
 * could have been set by a database write or by a past version, and demanding
 * the new format from it at sign-in would mean locking a person out. The format
 * is checked on creation only.
 *
 * The ceiling is set by the product, not by the storage (the column is
 * VARCHAR(255)): a login is shown in a list row in full and is never truncated,
 * because it is what people sign in with and what an account is found by. A
 * value that does not fit the row would have to be either truncated (that is,
 * hide half of what the person saved) or allowed to break the layout. Fourteen
 * characters are enough for both a mail prefix and `first.last`.
 */
export const BRICKS_NEW_USERNAME_MIN_LENGTH = 3;
export const BRICKS_NEW_USERNAME_MAX_LENGTH = 14;

/**
 * Allowed format of a new login — already lowercased (uniqueness is held by an
 * index over `lower(username)`, and the same login in different cases is one
 * account). A dot, a hyphen, an underscore, a plus and `@` are allowed: mail in
 * the role of a login is a common case.
 */
export const BRICKS_NEW_USERNAME_PATTERN = /^[a-z0-9][a-z0-9._@+-]*$/;

/**
 * Length ceiling of the profile display name.
 *
 * The `display_name` column is TEXT and sets no bounds, so the product sets them:
 * the name is shown in the row of the account list and in the profile menu, and a
 * value longer than this would either break the layout or be truncated on screen
 * — that is, the person would not see what they saved.
 */
export const BRICKS_DISPLAY_NAME_MAX_LENGTH = 64;

/**
 * Allowed content of a display name: any printable characters except control
 * ones.
 *
 * Control characters are forbidden not for the sake of escaping (Vue escapes text
 * itself) but because a line break inside a name would break the list row and the
 * profile menu, while invisible characters would make two different names
 * indistinguishable on screen.
 */
export const BRICKS_DISPLAY_NAME_PATTERN = /^[^\p{Cc}]+$/u;

/**
 * Ceiling of the incoming avatar file (MB).
 *
 * Lives in common because both sides need the number: the upload endpoint rejects
 * by it, and the profile form prints it in the hint and cuts the file off by it
 * before sending. Once they drift apart, they would either promise a person more
 * than the server accepts or push a file over the network that is doomed to a 413
 * anyway.
 *
 * Below the media ceiling (10 MB) deliberately: an avatar is one photograph, not
 * a working file of a page.
 */
export const BRICKS_AVATAR_MAX_UPLOAD_MB = 5;

/** Minimum length of a password set through the API */
export const BRICKS_PASSWORD_MIN_LENGTH = 8;

/** Login of the administrator the migration creates in a fresh database */
export const BRICKS_DEFAULT_ADMIN_USERNAME = 'admin';

/**
 * The password of that administrator. Public by construction: it is the same in
 * every installation of the package and printed in the README, which is why
 * setting it for ANYONE is forbidden — every password-setting endpoint rejects
 * it.
 *
 * The ban also holds up the "the password is still the default one" detection: it
 * compares the hash with the seeded one, and a freshly set password has a salt of
 * its own. Without the ban a person could change their password to itself,
 * silencing the warning while leaving the account publicly known.
 *
 * Lives in common because both sides need it: the endpoints reject by it, and the
 * builder forms have to state the reason before sending — otherwise the person
 * only sees "password rejected" with no explanation.
 */
export const BRICKS_DEFAULT_ADMIN_PASSWORD = 'bricks-pass';

/**
 * Sanity bound on the password length: the longer the input, the longer scrypt
 * computes. Matches the bound at sign-in (`auth/login.post.ts`) — otherwise a
 * password accepted when it was set would not pass when signing in.
 */
export const BRICKS_PASSWORD_MAX_LENGTH = 1024;

/**
 * Name of the custom CSRF header of unsafe bricks-API requests.
 *
 * A cross-origin document cannot set a custom header without a CORS preflight
 * (the module enables no CORS) — its presence proves same-origin. The builder
 * client (useApiClient) always sends it; non-browser automation has to add
 * `x-bricks-csrf: 1` to unsafe requests.
 */
export const BRICKS_CSRF_HEADER_NAME = 'x-bricks-csrf';
