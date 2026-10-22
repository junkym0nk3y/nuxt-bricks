// #region Imports
// Types
import type { IBricksUserSummary, TBricksUserRole } from '../../../common/types/auth';
import type {
    IUserResponse,
    IUseUsersActionsOptions,
    IUseUsersActionsReturn,
    TUsersConfirmKind,
} from '../types/users';

// Utils
import { isStaleListError, resolveUserActionErrorKey } from '../utils/userErrors';
import { isRequestTimeoutError } from '../../../common/utils/apiRequestPolicy';
import { resolveUserLabel } from '../utils/userFormatting';

// Vue
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';

// Composables
import { useApiClient } from '../../../common/composables/useApiClient';
import { useUsersData } from './useUsersData';

// Constants
import { BRICKS_AUTH_REQUEST_TIMEOUT_MS } from '../../../common/constants/apiTimeouts';
// #endregion

/**
 * The operations on someone else's accounts: the role, sign-in and deletion —
 * together with the confirmations and the toasts.
 *
 * Not a single operation here makes an optimistic edit: the endpoints hand back the
 * full state of the row, and waiting for the response is cheaper than drawing a guess
 * that has to be rolled back on a refusal. While a request is in flight the row actions
 * of the whole list are closed: a second one starts neither on this row nor on a
 * neighboring one. The forms of the section (creation, someone else's password) run
 * outside this queue and hold a submitting state of their own.
 *
 * On one row — because two responses carrying the full state of the account would
 * overwrite each other in their order of arrival. On neighboring rows parallelism is
 * technically possible (the list is edited by `id`, the responses of different rows do
 * not collide), but it is not needed: there are few operations on accounts and they
 * come one at a time, while the price would be a couple of busy rows on screen, a set
 * of busy `id`s instead of one, and sorting out the order of the toasts. That is why
 * the busy state is one per section — and the markup has to dim the actions of ALL
 * rows, otherwise the buttons of the neighbors look operable while a click on them
 * silently does nothing.
 *
 * The refusals are sorted out by what they mean. A divergence from the server (an edge
 * rule the interface did not expect, or an account that is gone) and an abort by the
 * waiting ceiling additionally re-read the list: in the first case the shown state has
 * fallen behind the database, in the second the outcome of the operation is unknown —
 * the server may have applied it and failed to answer in time, and "it did not work
 * out" would be untrue.
 *
 * @param options - Showing the toasts (the dashboard owns them).
 * @returns The busy state, the confirmations and the operations.
 */
export function useUsersActions(options: IUseUsersActionsOptions): IUseUsersActionsReturn {
    // #region Data
    const { t } = useI18n();
    const { apiFetcher } = useApiClient();
    const { upsertUser, removeUser, refreshUsers } = useUsersData();

    const pendingUserId = ref<number | null>(null);
    /** What is being confirmed and on whom; `null` — the dialog is closed */
    const confirmKind = ref<TUsersConfirmKind | null>(null);
    const confirmTarget = ref<IBricksUserSummary | null>(null);
    const isConfirmLoading = ref(false);
    // #endregion

    // #region Computed
    const isConfirmOpen = computed<boolean>(() => confirmKind.value !== null);

    /**
     * The caption of the confirmation's target. Taken from the snapshot of the account
     * made at the moment the confirmation was requested: the list can change while the
     * dialog is open, and the title has to name the very person that was asked about.
     */
    const confirmUserLabel = computed<string>(() =>
        confirmTarget.value ? resolveUserLabel(confirmTarget.value) : ''
    );

    const confirmTitle = computed<string>(() =>
        confirmKind.value
            ? t(`bricks.users.confirm.${confirmKind.value}.title`, { user: confirmUserLabel.value })
            : ''
    );

    const confirmDescription = computed<string>(() =>
        confirmKind.value ? t(`bricks.users.confirm.${confirmKind.value}.description`) : ''
    );

    const confirmActionText = computed<string>(() =>
        confirmKind.value ? t(`bricks.users.confirm.${confirmKind.value}.action`) : ''
    );
    // #endregion

    // #region Methods
    /**
     * Performs an operation on an account under the busy flag and sorts out a refusal.
     *
     * One order for every operation: busy, request, refusal analysis, busy released.
     * Separate `try/catch` blocks in each operation would drift apart — the re-read of
     * the list after an abort, for instance, would end up in only one of them.
     *
     * @param user - The target account.
     * @param operation - The request itself.
     * @returns Whether it succeeded: the caller needs to know whether to show a
     * success toast.
     */
    async function runUserOperation(
        user: IBricksUserSummary,
        operation: () => Promise<void>
    ): Promise<boolean> {
        // The busy state is shared per section: while an operation is running, a second
        // one starts neither here nor in a neighboring row
        if (pendingUserId.value !== null) {
            return false;
        }

        pendingUserId.value = user.id;

        try {
            await operation();

            return true;
        } catch (error: unknown) {
            options.onNotify(t(resolveUserActionErrorKey(error)), 'error');

            if (isStaleListError(error) || isRequestTimeoutError(error)) {
                await refreshUsers();
            }

            return false;
        } finally {
            pendingUserId.value = null;
        }
    }

    /**
     * Edits the state of an account (the role or the ability to sign in) and puts the
     * response into the list.
     *
     * @param user - The target account.
     * @param change - The fields being changed.
     */
    async function patchUser(
        user: IBricksUserSummary,
        change: { role?: TBricksUserRole; isActive?: boolean }
    ): Promise<void> {
        const response = await apiFetcher<IUserResponse>(`/api/bricks/users/${user.id}`, {
            method: 'PATCH',
            body: change,
            // A short write — one UPDATE of the account row with the revocation of its
            // sessions; the shared write ceiling would hold the row busy three times
            // longer than needed
            timeout: BRICKS_AUTH_REQUEST_TIMEOUT_MS,
        });

        upsertUser(response.user);
    }

    /**
     * Changes the role of an account.
     *
     * Picking the current role again sends no request at all: the server ignores such
     * an edit anyway (the state has not changed, so the sessions are not torn down),
     * but a "the sessions are over" toast after it would be a lie, and the row would
     * blink busy for no reason.
     *
     * @param user - The target account.
     * @param role - The new role.
     */
    async function changeRole(user: IBricksUserSummary, role: TBricksUserRole): Promise<void> {
        if (user.role === role) {
            return;
        }

        const isDone = await runUserOperation(user, () => patchUser(user, { role }));

        if (isDone) {
            options.onNotify(t('bricks.users.toasts.roleChanged'), 'success');
        }
    }

    /**
     * Turns sign-in on for an account.
     *
     * Asks for no confirmation, unlike turning it off: turning it on widens access and
     * is undone by the very action next to it, while a question before a harmless
     * operation teaches a person to dismiss questions unread.
     *
     * @param user - The target account.
     */
    async function activateUser(user: IBricksUserSummary): Promise<void> {
        const isDone = await runUserOperation(user, () => patchUser(user, { isActive: true }));

        if (isDone) {
            options.onNotify(t('bricks.users.toasts.activated'), 'success');
        }
    }

    /**
     * Asks for confirmation of an operation a person does not expect to undo with a
     * single click: turning sign-in off tears down live sessions, deletion is
     * irreversible.
     *
     * @param kind - What is being confirmed.
     * @param user - The target account.
     */
    function requestConfirm(kind: TUsersConfirmKind, user: IBricksUserSummary): void {
        // The dialog does not open while somebody else's operation runs: a confirmed
        // edit would be dropped by the busy state anyway, and the question would be left
        // unanswered
        if (pendingUserId.value !== null) {
            return;
        }

        confirmKind.value = kind;
        confirmTarget.value = user;
    }

    /**
     * Closes the confirmation without performing the operation.
     *
     * The target is dropped together with the kind: a snapshot of the account left
     * behind would be read by the title of the next dialog before a new target is put
     * into it.
     */
    function closeConfirm(): void {
        confirmKind.value = null;
        confirmTarget.value = null;
    }

    /**
     * Turns sign-in off for an account.
     *
     * @param user - The target account.
     */
    async function deactivateUser(user: IBricksUserSummary): Promise<void> {
        const isDone = await runUserOperation(user, () => patchUser(user, { isActive: false }));

        if (isDone) {
            options.onNotify(t('bricks.users.toasts.deactivated'), 'success');
        }
    }

    /**
     * Deletes an account and takes its row out of the list.
     *
     * The row is removed only after the response: a deletion shown before the server
     * confirmed it would have to be put back into its place in the order of the list
     * on a refusal.
     *
     * @param user - The target account.
     */
    async function deleteUser(user: IBricksUserSummary): Promise<void> {
        const isDone = await runUserOperation(user, async () => {
            await apiFetcher(`/api/bricks/users/${user.id}`, {
                method: 'DELETE',
                timeout: BRICKS_AUTH_REQUEST_TIMEOUT_MS,
            });

            removeUser(user.id);
        });

        if (isDone) {
            options.onNotify(
                t('bricks.users.toasts.deleted', { user: resolveUserLabel(user) }),
                'success'
            );
        }
    }

    /**
     * Performs the confirmed operation and closes the dialog.
     *
     * The dialog closes AFTER the response while its button holds the waiting state:
     * had it closed earlier, a person would be left with a list in which the row has
     * not changed yet, not knowing whether the operation is running.
     */
    async function confirmAction(): Promise<void> {
        const target = confirmTarget.value;
        const kind = confirmKind.value;

        if (!target || !kind || isConfirmLoading.value) {
            return;
        }

        isConfirmLoading.value = true;

        try {
            if (kind === 'delete') {
                await deleteUser(target);
            } else {
                await deactivateUser(target);
            }
        } finally {
            isConfirmLoading.value = false;
            closeConfirm();
        }
    }
    // #endregion

    return {
        pendingUserId: computed(() => pendingUserId.value),
        isConfirmOpen,
        confirmTitle,
        confirmDescription,
        confirmActionText,
        isConfirmLoading: computed(() => isConfirmLoading.value),
        changeRole,
        activateUser,
        requestConfirm,
        closeConfirm,
        confirmAction,
    };
}
