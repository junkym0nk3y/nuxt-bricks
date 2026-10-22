<script setup lang="ts">
/**
 * @description The account list of the "Users" section: the segment filter by the
 * ability to sign in, and the rows. The loading and the empty-result states are built
 * as in the page list — a spinner instead of "nobody is here" until the list has been
 * read: an empty state makes an assertion, and before the response there is nothing to
 * assert.
 *
 * A temporary refusal (the network, 5xx) shows a retry rather than an empty screen:
 * the section exists, it merely did not answer. Unavailability for good (turned off by
 * a flag, the wrong role) never reaches here at all — under it the rail item
 * disappears, and there is nobody to show the list to.
 */

// #region Imports
// Types
import type { IBricksUserSummary, TBricksUserRole } from '../../../common/types/auth';
import type { IBricksTabItem } from '../../../ui/base/tabs/types.d.ts';
import type { IUsersListProps, IUsersListEmits, TUsersFilter } from '../types/users';

// Vue
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

// Components
import BuilderUsersListRow from './BuilderUsersListRow.vue';
import BricksButton from '../../../ui/base/button/BricksButton.vue';
import BricksEmptyState from '../../../ui/feedback/BricksEmptyState.vue';
import BricksTabBar from '../../../ui/base/tabs/BricksTabBar.vue';
// #endregion

// #region Props
const props = withDefaults(defineProps<IUsersListProps>(), {});
// #endregion

// #region Emits
const emit = defineEmits<IUsersListEmits>();
// #endregion

// #region Data
const { t } = useI18n();

const FILTERS: TUsersFilter[] = ['all', 'active', 'inactive'];
// #endregion

// #region Computed
const filterItems = computed<IBricksTabItem[]>(() =>
    FILTERS.map((filter) => ({
        value: filter,
        label: t(`bricks.users.filters.${filter}`),
        count: props.counts[filter],
    }))
);

/**
 * The list is being read: until the server answers, neither rows nor claims about
 * their absence.
 */
const isLoading = computed<boolean>(() => props.status === 'idle' || props.status === 'loading');
// #endregion

// #region Methods
/**
 * Switches the active segment filter.
 *
 * @param value - The value of the chosen tab.
 */
function handleSelectFilter(value: string): void {
    const filter = FILTERS.find((item) => item === value);

    if (!filter) {
        return;
    }

    emit('update:activeFilter', filter);
}

/**
 * Asks for the account creation form to be opened.
 */
function handleCreateUser(): void {
    emit('create-user');
}

/**
 * Asks for the list load to be retried.
 */
function handleRetry(): void {
    emit('retry');
}

/**
 * Forwards a role change.
 *
 * @param user - The account.
 * @param role - The new role.
 */
function handleChangeRole(user: IBricksUserSummary, role: TBricksUserRole): void {
    emit('change-role', user, role);
}

/**
 * Forwards a request for the admin password form.
 *
 * @param user - The account.
 */
function handleSetPassword(user: IBricksUserSummary): void {
    emit('set-password', user);
}

/**
 * Forwards a request for one's own password form (the profile tab).
 */
function handleChangeOwnPassword(): void {
    emit('change-own-password');
}

/**
 * Forwards the turning of sign-in on.
 *
 * @param user - The account.
 */
function handleActivate(user: IBricksUserSummary): void {
    emit('activate', user);
}

/**
 * Forwards the turning of sign-in off.
 *
 * @param user - The account.
 */
function handleDeactivate(user: IBricksUserSummary): void {
    emit('deactivate', user);
}

/**
 * Forwards the deletion of an account.
 *
 * @param user - The account.
 */
function handleDelete(user: IBricksUserSummary): void {
    emit('delete', user);
}
// #endregion
</script>

<template>
    <div :class="$style.BuilderUsersList">
        <BricksTabBar
            :class="$style.filterBar"
            :model-value="props.activeFilter"
            :items="filterItems"
            :group-label="t('bricks.users.filtersLabel')"
            @update:model-value="handleSelectFilter"
        />

        <div v-if="isLoading" :class="$style.loading">
            <span :class="$style.spinner" />
            <p :class="$style.loadingText">{{ t('bricks.common.loading') }}</p>
        </div>

        <BricksEmptyState
            v-else-if="props.status === 'error'"
            :class="$style.empty"
            icon="ta:outline-users"
            :title="t('bricks.users.loadError.title')"
            :description="t('bricks.users.loadError.description')"
        >
            <BricksButton size="md" variant="secondary" @click="handleRetry">
                {{ t('bricks.users.loadError.retry') }}
            </BricksButton>
        </BricksEmptyState>

        <BricksEmptyState
            v-else-if="props.users.length === 0 && !props.hasAnyUsers"
            :class="$style.empty"
            icon="ta:outline-users"
            :title="t('bricks.users.empty.title')"
            :description="t('bricks.users.empty.description')"
        >
            <BricksButton size="md" variant="primary" @click="handleCreateUser">
                + {{ t('bricks.users.createUser') }}
            </BricksButton>
        </BricksEmptyState>

        <BricksEmptyState
            v-else-if="props.users.length === 0"
            :class="$style.empty"
            icon="ta:outline-search"
            :title="t('bricks.users.empty.noResultsTitle')"
            :description="t('bricks.users.empty.noResultsDescription')"
        />

        <div v-else :class="$style.rows">
            <BuilderUsersListRow
                v-for="user in props.users"
                :key="user.id"
                :user="user"
                :is-current-user="user.id === props.currentUserId"
                :is-last-active-admin="user.id === props.lastActiveAdminId"
                :is-pending="user.id === props.pendingUserId"
                :is-operation-locked="props.pendingUserId !== null"
                @change-role="handleChangeRole"
                @set-password="handleSetPassword"
                @change-own-password="handleChangeOwnPassword"
                @activate="handleActivate"
                @deactivate="handleDeactivate"
                @delete="handleDelete"
            />
        </div>
    </div>
</template>

<style module lang="scss">
.BuilderUsersList {
    display: flex;
    flex-direction: column;
    gap: 1.6rem;
}

.filterBar {
    align-self: flex-start;
}

.rows {
    display: flex;
    flex-direction: column;
    gap: 1.6rem;
}

.loading {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-direction: column;
    padding: 6rem 2rem;
    color: var(--bricks-base-500);
}

.spinner {
    width: 3.2rem;
    height: 3.2rem;
    margin-bottom: 1.2rem;
    border-radius: 50%;
    border: 0.4rem solid var(--bricks-base-200);
    border-top-color: var(--bricks-base-400);
    animation: spin 1s linear infinite;
}

@keyframes spin {
    0% {
        transform: rotate(0deg);
    }

    100% {
        transform: rotate(360deg);
    }
}

.loadingText {
    margin: 0;
    font-size: 1.4rem;
}

.empty {
    padding: 8rem 2.4rem;
}
</style>
