// #region Imports
// Types
import type { IAuthSessionResponse, IAuthSessionUserPayload } from '../types/auth';
import type { TRequestErrorLike } from '../../../common/types/bricks-api';

// Composables
import { useApiClient } from '../../../common/composables/useApiClient';
import { useBricksRoutePaths } from '../../../common/composables/useBricksRoutePaths';

// Constants
import { BRICKS_AUTH_REQUEST_TIMEOUT_MS } from '../../../common/constants/apiTimeouts';

// Nuxt
import { useRuntimeConfig } from '#imports';
// #endregion

// #region Data
/** The one status meaning "there is no session" and not "the check failed". */
const UNAUTHORIZED_STATUS = 401;
// #endregion

/**
 * Client session of the database auth: the mode, login/logout, the current user.
 * In basic mode `isDatabaseMode` is false — the UI (the "Log out" button, the login
 * page) is not shown or redirects away.
 */
export function useAuthSession() {
    // #region Data
    const config = useRuntimeConfig();
    const { apiFetcher } = useApiClient();
    const { builderLoginPath, withBase } = useBricksRoutePaths();

    const isDatabaseMode = (config.public?.bricksAuthMode as string | undefined) === 'database';
    // #endregion

    // #region Methods
    /**
     * Logs in by username and password; success creates a cookie session on the
     * server. The errors (401/429/503) are rethrown to the caller — the form maps
     * them onto messages.
     *
     * @param username - User name.
     * @param password - Password.
     * @returns User of the created session.
     */
    async function login(username: string, password: string): Promise<IAuthSessionUserPayload> {
        const response = await apiFetcher<IAuthSessionResponse>('/api/bricks/auth/login', {
            method: 'POST',
            body: { username, password },
            // A short write: the shared write ceiling (30 s) would keep the form
            // button held three times longer than needed
            timeout: BRICKS_AUTH_REQUEST_TIMEOUT_MS,
        });

        return response.user;
    }

    /**
     * Logs out: removes the session and leaves for the login with a full reload
     * (which resets the builder stores cleanly).
     */
    async function logout(): Promise<void> {
        await apiFetcher('/api/bricks/auth/logout', {
            method: 'POST',
            timeout: BRICKS_AUTH_REQUEST_TIMEOUT_MS,
        });
        window.location.assign(withBase(builderLoginPath));
    }

    /**
     * The whole current session; null — when not signed in (401).
     *
     * The whole answer is given out rather than the user alone: the default password
     * flag arrives next to it, and pulling that out with a second request would mean
     * asking the server about the very same thing twice.
     *
     * The other failures (5xx, an abort on the waiting ceiling) are rethrown: they
     * do not mean "not signed in", and a caller taking them for a 401 would show the
     * login form to a person with a working session — or, the other way round, take
     * them into a loop of signing in. Telling them apart is only possible here:
     * folded into the return value they would all leave as one and the same `null`.
     */
    async function fetchMe(): Promise<IAuthSessionResponse | null> {
        try {
            return await apiFetcher<IAuthSessionResponse>('/api/bricks/auth/me');
        } catch (error: unknown) {
            if ((error as TRequestErrorLike).statusCode === UNAUTHORIZED_STATUS) {
                return null;
            }

            throw error;
        }
    }
    // #endregion

    return {
        isDatabaseMode,
        login,
        logout,
        fetchMe,
    };
}
