<script setup lang="ts">
/**
 * @description Список учёток раздела «Пользователи»: сегмент-фильтр по
 * возможности входа и строки. Состояния загрузки и пустого результата устроены
 * как в списке страниц — спиннер вместо «никого нет», пока список не прочитан:
 * пустое состояние утверждает, а до ответа утверждать нечего.
 *
 * Временный отказ (сеть, 5xx) показывает повтор, а не пустой экран: раздел
 * существует, просто не ответил. Окончательная недоступность (выключен флагом,
 * не та роль) сюда не доходит вовсе — при ней пункт рейла исчезает, и
 * показывать список некому.
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

/** Список читается: до ответа сервера ни строк, ни утверждений о их отсутствии. */
const isLoading = computed<boolean>(() => props.status === 'idle' || props.status === 'loading');
// #endregion

// #region Methods
/**
 * Переключает активный сегмент-фильтр.
 *
 * @param value - Значение выбранного таба.
 */
function handleSelectFilter(value: string): void {
    const filter = FILTERS.find((item) => item === value);

    if (!filter) {
        return;
    }

    emit('update:activeFilter', filter);
}

/**
 * Просит открыть форму создания учётки.
 */
function handleCreateUser(): void {
    emit('create-user');
}

/**
 * Просит повторить загрузку списка.
 */
function handleRetry(): void {
    emit('retry');
}

/**
 * Пробрасывает смену роли.
 *
 * @param user - Учётка.
 * @param role - Новая роль.
 */
function handleChangeRole(user: IBricksUserSummary, role: TBricksUserRole): void {
    emit('change-role', user, role);
}

/**
 * Пробрасывает запрос админской формы пароля.
 *
 * @param user - Учётка.
 */
function handleSetPassword(user: IBricksUserSummary): void {
    emit('set-password', user);
}

/**
 * Пробрасывает запрос своей формы пароля (вкладка профиля).
 */
function handleChangeOwnPassword(): void {
    emit('change-own-password');
}

/**
 * Пробрасывает включение входа.
 *
 * @param user - Учётка.
 */
function handleActivate(user: IBricksUserSummary): void {
    emit('activate', user);
}

/**
 * Пробрасывает выключение входа.
 *
 * @param user - Учётка.
 */
function handleDeactivate(user: IBricksUserSummary): void {
    emit('deactivate', user);
}

/**
 * Пробрасывает удаление учётки.
 *
 * @param user - Учётка.
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

        <!--
            Занятость раздела приходит в строку двумя разными признаками:
            обновляется одна строка, а недоступны на это время действия ВСЕХ —
            операции сериализованы, и клик по соседней строке был бы отброшен
            молча
        -->
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

/* Отступы состояния задаёт раздел: у списка это высокая полоса по центру. */
.empty {
    padding: 8rem 2.4rem;
}
</style>
