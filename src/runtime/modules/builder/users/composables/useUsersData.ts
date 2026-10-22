// #region Imports
// Types
import type { IBricksUserSummary } from '../../../common/types/auth';
import type { IUsersListResponse, IUsersState, IUseUsersDataReturn } from '../types/users';

// Utils
import { isUsersSectionUnavailableError } from '../utils/userErrors';
import { withPromiseDeadline } from '../../../common/utils/promiseDeadline';

// Vue
import { computed } from 'vue';

// Composables
import { useApiClient } from '../../../common/composables/useApiClient';
import { useBuilderPermissions } from '../../core/composables/useBuilderPermissions';

// Constants
import {
    BRICKS_API_READ_TIMEOUT_MS,
    BRICKS_SSR_DEADLINE_MARGIN_MS,
} from '../../../common/constants/apiTimeouts';

// Nuxt
import { useNuxtApp, useState } from '#imports';
// #endregion

// #region Data
/** The key of the shared account list state: one value per application */
const USERS_STATE_KEY = 'bricks-users';

/** The endpoint listing and creating accounts */
const USERS_ENDPOINT = '/api/bricks/users';

/**
 * The load in flight — per Nuxt application instance rather than in a module
 * variable.
 *
 * On the server a module-global promise is shared by ALL requests of the process: two
 * simultaneous SSR renders of the dashboard would receive one and the same list, that
 * is, an administrator could see a response obtained under someone else's session. A
 * `WeakMap` keyed by the application instance isolates the deduplication per request
 * and keeps no reference once that request is over.
 */
const inflightRequests = new WeakMap<object, Promise<void>>();

/**
 * The counter of local edits of the list — per application instance as well.
 *
 * It lives next to the state rather than inside it: `useState` travels into the
 * hydration payload, and a housekeeping counter has no place there.
 */
const localRevisions = new WeakMap<object, { count: number }>();
// #endregion

/**
 * The account list of the "Users" section: reading it from the server and the
 * targeted edits of the state after an operation.
 *
 * The state is `useState` rather than a Pinia store: the list lives on one surface
 * (a section of the dashboard) and needs no cross-surface cache, while it does need
 * an SSR seed — the rail counter is drawn in the first frame, together with the
 * section item itself.
 *
 * The edits after an operation are targeted (`upsertUser`, `removeUser`) instead of
 * a re-read of the whole list: the endpoints hand back the full state of the account,
 * and a second GET for what has already arrived would only add a frame in which the
 * list managed to redraw twice. The full re-read stays with `refreshUsers` — for a
 * retry after a refusal and for a check when the server has reported a divergence.
 *
 * @returns The list, whether it has been read and the operations on the state.
 */
export function useUsersData(): IUseUsersDataReturn {
    // #region Data
    const nuxtApp = useNuxtApp();
    const { apiFetcher } = useApiClient();
    const { canManageUsers } = useBuilderPermissions();

    // Every transition writes the state as one object rather than editing it field by
    // field: an assignment then names the complete next state of the section, and no
    // half-written combination has to be reasoned about. Reactivity is not the reason
    // to do it this way — `useState` is a `toRef` onto a reactive payload, so a
    // targeted write notifies subscribers just as well
    const state = useState<IUsersState>(USERS_STATE_KEY, () => ({ users: [], status: 'idle' }));

    // Shared per application: the composable is called by the rail, by the section
    // and by the forms
    const revision = localRevisions.get(nuxtApp) ?? { count: 0 };

    localRevisions.set(nuxtApp, revision);
    // #endregion

    // #region Computed
    const users = computed<IBricksUserSummary[]>(() => state.value.users);
    const status = computed(() => state.value.status);

    const usersCount = computed<number | null>(() =>
        state.value.status === 'ready' ? state.value.users.length : null
    );

    /**
     * The only active administrator — the one who can be neither demoted, nor turned
     * off, nor deleted: the system would be left with no management of accounts.
     *
     * Counted over the whole list (the search and the filter do not affect this rule)
     * and remains a hint of the interface: the decision belongs to the server anyway,
     * where the set of administrators is locked by a transaction. The value is here
     * for exactly one purpose — so that a person sees a lock with an explanation
     * before the click rather than a 409 after it.
     */
    const lastActiveAdminId = computed<number | null>(() => {
        const activeAdmins = state.value.users.filter(
            (user) => user.isActive && user.role === 'admin'
        );

        return activeAdmins.length === 1 ? activeAdmins[0].id : null;
    });
    // #endregion

    // #region Methods
    /**
     * Reads the list from the server and writes the outcome into the section state.
     *
     * A refusal does not travel outward: the load is started by the composition root
     * before the first frame, and a rejected promise would take the whole dashboard
     * away because of a section a person might never have opened. The state is marked
     * instead — either unavailable for good (the section does not exist in this
     * installation) or temporarily refused (the network, 5xx), and the latter shows a
     * retry button.
     */
    async function loadUsers(): Promise<void> {
        // A list already read is not dimmed while it is being read again: the rows on
        // screen are true as of the previous response, and a spinner in their place on
        // every entry into the section would take away from a person the very thing
        // they came to look at. A refusal still marks the state — a stale list must
        // not be passed off silently as a fresh one
        if (state.value.status !== 'ready') {
            state.value = { ...state.value, status: 'loading' };
        }

        // A loop rather than a single request: a response overtaken by a local edit
        // must not be applied, yet the read must not be abandoned either — the section
        // would be left with a state nobody knows to be fresh or not. The iteration
        // repeats exactly when an operation edited the list between the start of the
        // request and its response, which is why it stops by itself: the edits are made
        // by a person, and those are rarer than the answers of the server
        for (;;) {
            const revisionAtStart = revision.count;

            try {
                const response = await requestWithinDeadline();

                if (revision.count !== revisionAtStart) {
                    continue;
                }

                state.value = { users: response.users, status: 'ready' };
            } catch (error: unknown) {
                state.value = {
                    ...state.value,
                    status: isUsersSectionUnavailableError(error) ? 'unavailable' : 'error',
                };

                console.error('[Builder] Failed to load users list:', error);
            }

            return;
        }
    }

    /**
     * Bounds the waiting for the list during SSR.
     *
     * The transport ceiling is inert on the server: a relative URL travels as an
     * internal Nitro call, and that call does not listen to an `AbortSignal`. Without
     * an external deadline a hung request would hold not the account list but the
     * whole page response — the dashboard would not arrive at all because of a section
     * that shows a single number in the first frame.
     *
     * @returns The response of the list endpoint.
     */
    function requestWithinDeadline(): Promise<IUsersListResponse> {
        const request = apiFetcher<IUsersListResponse>(USERS_ENDPOINT, {
            timeout: BRICKS_API_READ_TIMEOUT_MS,
        });

        if (!import.meta.server) {
            return request;
        }

        const deadlineMs = BRICKS_API_READ_TIMEOUT_MS + BRICKS_SSR_DEADLINE_MARGIN_MS;

        return withPromiseDeadline(
            request,
            deadlineMs,
            () => new Error(`Users list did not arrive within ${deadlineMs} ms`)
        );
    }

    /**
     * Hands back the load in flight, or starts a new one.
     *
     * The deduplication is needed not against repeat calls from the composition root
     * but against the second consumer of the list: the rail with the counter and the
     * section itself ask for one state, and without a shared promise the first frame
     * would send two identical GETs. A second call during a running load joins it —
     * a retry from a button pressed twice included.
     *
     * @returns The promise of the current load.
     */
    function startLoad(): Promise<void> {
        const inflight = inflightRequests.get(nuxtApp);

        if (inflight) {
            return inflight;
        }

        const request = loadUsers().finally(() => {
            inflightRequests.delete(nuxtApp);
        });

        inflightRequests.set(nuxtApp, request);

        return request;
    }

    /**
     * Loads the list unless it has been read already.
     *
     * The right to the section is checked HERE rather than at the caller: a request
     * without it is guaranteed a refusal, and keeping this guard on the host side
     * would mean losing it as soon as a second consumer of the list appears. The role
     * has to be known by the time of the call — in a build without SSR that is
     * `ensureRole` of the composition root, otherwise a viewer would send a request
     * to fetch a refusal.
     *
     * A list already read is not read again, and neither is an unavailable section: a
     * 404 means the endpoints are not in this installation and a 403 means this caller
     * will not be let into them, so a "what if that has changed" attempt on every entry
     * into the section would be a request for the very same answer.
     */
    async function ensureUsers(): Promise<void> {
        if (!canManageUsers.value) {
            state.value = { ...state.value, status: 'unavailable' };
            return;
        }

        if (state.value.status === 'ready' || state.value.status === 'unavailable') {
            return;
        }

        return startLoad();
    }

    /**
     * Forces a re-read of the list: a retry after a temporary refusal and a check after
     * a refused operation that showed the list to have fallen behind the database.
     *
     * The previous list does not disappear when the retry is refused — the state is
     * only marked as refused while the rows stay: an empty screen would report that
     * there are no accounts.
     */
    async function refreshUsers(): Promise<void> {
        return startLoad();
    }

    /**
     * Puts an account into the list: a known one in its place, a new one at the end.
     *
     * At the end rather than at the start: the server hands the list back in creation
     * order (by `id`), and a freshly created account has to land where it will land
     * after the next read — otherwise it would jump elsewhere on the very first
     * refresh.
     *
     * @param user - The state of the account as received from the endpoint.
     */
    function upsertUser(user: IBricksUserSummary): void {
        const isKnown = state.value.users.some((item) => item.id === user.id);

        revision.count += 1;

        state.value = {
            ...state.value,
            users: isKnown
                ? state.value.users.map((item) => (item.id === user.id ? user : item))
                : [...state.value.users, user],
        };
    }

    /**
     * Takes an account out of the list after a confirmed deletion.
     *
     * @param userId - The id of the deleted account.
     */
    function removeUser(userId: number): void {
        revision.count += 1;

        state.value = {
            ...state.value,
            users: state.value.users.filter((item) => item.id !== userId),
        };
    }
    // #endregion

    return {
        users,
        status,
        usersCount,
        lastActiveAdminId,
        ensureUsers,
        refreshUsers,
        upsertUser,
        removeUser,
    };
}
