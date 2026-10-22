/**
 * Resolving the authorized session out of a request — logic shared by the
 * `server/middleware/auth.ts` middleware and the `auth/me.get` handler.
 */
import { getSessionTokenFromCookie, hashSessionToken } from './sessionCookie';
import { useBricksAuthAdapter } from '../../../modules/persistence/server/registry';
import type { IAuthSessionWithUser } from '../../../modules/persistence/types/authAdapters';
import type { H3Event } from 'h3';

/**
 * Resolves the user session from the request cookie.
 *
 * null means there is no cookie, the session was not found or has expired, or the
 * user has been deactivated — and only that answer means "not authenticated".
 *
 * Adapter errors (an unreachable database) are rethrown untouched, because the
 * two callers map them differently: the auth middleware answers 503, since a
 * session check runs before every protected request and a 500 there would read as
 * a broken editor; `auth/me.get` hands the error to `toHttpError` and gets a 504
 * for a statement timeout or a 500 for anything else. Mapping here would take
 * that choice away from both.
 *
 * @param event - Request event.
 * @returns The session with its user (no secrets), or null.
 */
export async function resolveSessionUser(event: H3Event): Promise<IAuthSessionWithUser | null> {
    const token = getSessionTokenFromCookie(event);

    if (!token) {
        return null;
    }

    const session = await useBricksAuthAdapter().getSessionWithUser(hashSessionToken(token));

    if (!session || !session.user.isActive) {
        return null;
    }

    return session;
}
