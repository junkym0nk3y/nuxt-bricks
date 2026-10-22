import { createError, defineEventHandler } from 'h3';
import { useRuntimeConfig } from 'nitropack/runtime';
import { toHttpError } from '../../../../modules/persistence/server/utils/handlerHelpers';
import { resolveSessionUser } from '../../../utils/auth/session';
import { toAuthProfileUser } from '../../../utils/auth/profile';

/**
 * GET /api/bricks/auth/me — the current user of the session (database mode).
 * Used by the login page (the "already signed in" guard) and by the composition
 * roots of the builder and the dashboard, which decide from the role which
 * actions to show at all; the 401 interceptor of the client lets the login page
 * through — there is no loop.
 *
 * The projection is shared with the profile handlers (`toAuthProfileUser`): the
 * corner of the screen is filled by this response and refreshed by the profile
 * responses, and two different shapes would leave it guessing what exactly
 * arrived.
 *
 * `isDefaultPassword` lies NEXT TO the projection rather than inside it: the
 * profile handlers return the same `user` shape, and any edit of the name or the
 * photo would wipe the flag out of the client state — the default password
 * warning would disappear when the avatar changed. Changing the password itself
 * breaks the session, so there is no need to refresh the flag from a profile
 * response at all: the next sign-in computes it anew.
 */
export default defineEventHandler(async (event) => {
    try {
        const config = useRuntimeConfig();

        if (config.bricksAuthMode !== 'database') {
            throw createError({ statusCode: 404, statusMessage: 'Not Found' });
        }

        const session = await resolveSessionUser(event);

        if (!session) {
            throw createError({ statusCode: 401, statusMessage: 'Unauthorized' });
        }

        return {
            user: toAuthProfileUser(session.user),
            isDefaultPassword: session.user.isDefaultPassword,
        };
    } catch (error: unknown) {
        toHttpError(error, 'Failed to resolve session');
    }
});
