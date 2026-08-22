<script setup lang="ts">
/**
 * @description The whole "Users" section: the list, its modals and the
 * confirmations.
 *
 * A controller component rather than markup inside the dashboard host: the section
 * has state of its own (the filter, the target of the password form, the busy row)
 * and four windows of its own, and assembled inside the host it would add a second
 * independent state machine next to the page list in that same file. The host stays
 * the composition root: it shows the toasts, holds the search field in the shared
 * header and opens the profile modal.
 *
 * What goes outward is exactly what does not belong to the section: the texts of the
 * toasts (there is one toast per dashboard) and the request to open one's own profile
 * (the profile modal lives in the auth domain, and the accounts section knows nothing
 * about it — one's own profile and somebody else's accounts are different things).
 */

// #region Imports
// Types
import type { IBricksUserSummary, TBricksUserRole } from '../../../common/types/auth';
import type { IUsersSectionProps, IUsersSectionEmits } from '../types/users';

// Utils
import { resolveUserLabel } from '../utils/userFormatting';

// Vue
import { computed, onMounted, ref, toRef } from 'vue';
import { useI18n } from 'vue-i18n';

// Composables
import { useUsersActions } from '../composables/useUsersActions';
import { useUsersData } from '../composables/useUsersData';
import { useUsersList } from '../composables/useUsersList';

// Components
import BuilderUsersList from './BuilderUsersList.vue';
import BricksConfirmModal from '../../../ui/feedback/BricksConfirmModal.vue';
import TheBuilderUsersCreateModal from './TheBuilderUsersCreateModal.vue';
import TheBuilderUsersPasswordModal from './TheBuilderUsersPasswordModal.vue';
// #endregion

// #region Props
const props = withDefaults(defineProps<IUsersSectionProps>(), {});
// #endregion

// #region Emits
const emit = defineEmits<IUsersSectionEmits>();
// #endregion

// #region Data
const { t } = useI18n();
const { users, status, lastActiveAdminId, refreshUsers } = useUsersData();
const { activeFilter, filterCounts, filteredUsers } = useUsersList(
    users,
    toRef(props, 'searchQuery')
);
const actions = useUsersActions({
    onNotify: (message, variant) => emit('notify', message, variant),
});

/** The account being given a password; `null` — the modal is closed */
const passwordTargetUser = ref<IBricksUserSummary | null>(null);
// #endregion

// #region Computed
const hasAnyUsers = computed<boolean>(() => users.value.length > 0);
// #endregion

// #region Methods
/**
 * Changes the role of an account.
 *
 * @param user - The account.
 * @param role - The new role.
 */
async function handleChangeRole(user: IBricksUserSummary, role: TBricksUserRole): Promise<void> {
    await actions.changeRole(user, role);
}

/**
 * Opens the password form of somebody else's account.
 *
 * @param user - The account.
 */
function handleSetPassword(user: IBricksUserSummary): void {
    passwordTargetUser.value = user;
}

/**
 * Closes the password form.
 */
function handleClosePasswordModal(): void {
    passwordTargetUser.value = null;
}

/**
 * The password is set: report it and close the form. The list does not change with
 * it — not a single field of the list depends on a password change.
 *
 * @param user - The account whose password was set.
 */
function handlePasswordSaved(user: IBricksUserSummary): void {
    passwordTargetUser.value = null;
    emit(
        'notify',
        t('bricks.users.toasts.passwordChanged', { user: resolveUserLabel(user) }),
        'success'
    );
}

/**
 * The account is created: close the form and report it.
 *
 * The row has already been put into the list by the form itself — from the response
 * of the endpoint rather than by a second read: a new account may not make it onto
 * the screen under an active search or filter, which leaves the toast as the
 * confirmation of success.
 *
 * @param user - The created account.
 */
function handleUserCreated(user: IBricksUserSummary): void {
    emit('close-create-modal');
    emit('notify', t('bricks.users.toasts.created', { user: resolveUserLabel(user) }), 'success');
}

/**
 * Asks for the creation form to be closed (the "Cancel" button, the cross, Esc).
 */
function handleCloseCreateModal(): void {
    emit('close-create-modal');
}

/**
 * Asks for one's own profile to be opened on the password tab: one's own password is
 * changed by the profile form, where the current one is mandatory.
 */
function handleChangeOwnPassword(): void {
    emit('change-own-password');
}
// #endregion

// #region Lifecycle
/*
    The list is re-read on EVERY entry into the section rather than on the first one
    only. Accounts are edited by more than one person: between two openings of the
    section a neighboring administrator could have created or turned off an account,
    while a row created by an aborted request appears in the database only after the
    form has spoken about it. The section has no other way to refresh the list — the
    retry button lives on the refusal screen alone — and without this read the shown
    state would hold until the page was reloaded.

    The section mounts exactly when the section is opened (the host draws its slot by
    the active section), which is what makes `onMounted` here mean "an entry into the
    section". The read is quiet: the rows on screen do not dim, and no spinner is seen
    while switching.
*/
onMounted(() => {
    refreshUsers();
});
// #endregion
</script>

<template>
    <div :class="$style.TheBuilderUsersSection">
        <BuilderUsersList
            :users="filteredUsers"
            :active-filter="activeFilter"
            :counts="filterCounts"
            :status="status"
            :has-any-users="hasAnyUsers"
            :current-user-id="props.currentUserId"
            :last-active-admin-id="lastActiveAdminId"
            :pending-user-id="actions.pendingUserId.value"
            @update:active-filter="activeFilter = $event"
            @create-user="emit('create-user')"
            @retry="refreshUsers"
            @change-role="handleChangeRole"
            @set-password="handleSetPassword"
            @change-own-password="handleChangeOwnPassword"
            @activate="actions.activateUser"
            @deactivate="(user) => actions.requestConfirm('deactivate', user)"
            @delete="(user) => actions.requestConfirm('delete', user)"
        />

        <TheBuilderUsersCreateModal
            :is-open="props.isCreateModalOpen"
            @close="handleCloseCreateModal"
            @created="handleUserCreated"
        />

        <TheBuilderUsersPasswordModal
            :user="passwordTargetUser"
            @close="handleClosePasswordModal"
            @saved="handlePasswordSaved"
        />

        <BricksConfirmModal
            :is-open="actions.isConfirmOpen.value"
            :title="actions.confirmTitle.value"
            :description="actions.confirmDescription.value"
            :confirm-text="actions.confirmActionText.value"
            confirm-variant="danger"
            :is-loading="actions.isConfirmLoading.value"
            @close="actions.closeConfirm"
            @confirm="actions.confirmAction"
        />
    </div>
</template>

<style module lang="scss">
.TheBuilderUsersSection {
    display: flex;
    flex-direction: column;
}
</style>
