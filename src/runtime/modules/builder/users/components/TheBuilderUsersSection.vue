<script setup lang="ts">
/**
 * @description Раздел «Пользователи» целиком: список, его модалки и
 * подтверждения.
 *
 * Компонент-контроллер, а не разметка внутри хоста дашборда: у раздела своё
 * состояние (фильтр, цель формы пароля, занятая строка) и свои четыре окна, и
 * собранный в хосте он добавил бы к списку страниц вторую независимую машину
 * состояний в том же файле. Хост остаётся composition root: он показывает
 * тосты, держит поле поиска в общей шапке и открывает модалку профиля.
 *
 * Наружу уходит ровно то, что разделу не принадлежит: тексты тостов (тост один
 * на дашборд) и просьба открыть свой профиль (модалка профиля живёт в
 * auth-домене, и раздел учёток о нём не знает — свой профиль и чужие учётки
 * разные вещи).
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

/** Учётка, которой задают пароль; `null` — модалка закрыта. */
const passwordTargetUser = ref<IBricksUserSummary | null>(null);
// #endregion

// #region Computed
const hasAnyUsers = computed<boolean>(() => users.value.length > 0);
// #endregion

// #region Methods
/**
 * Меняет роль учётки.
 *
 * @param user - Учётка.
 * @param role - Новая роль.
 */
async function handleChangeRole(user: IBricksUserSummary, role: TBricksUserRole): Promise<void> {
    await actions.changeRole(user, role);
}

/**
 * Открывает форму пароля чужой учётки.
 *
 * @param user - Учётка.
 */
function handleSetPassword(user: IBricksUserSummary): void {
    passwordTargetUser.value = user;
}

/**
 * Закрывает форму пароля.
 */
function handleClosePasswordModal(): void {
    passwordTargetUser.value = null;
}

/**
 * Пароль задан: сообщаем и закрываем форму. Список при этом не меняется — ни
 * одно его поле от смены пароля не зависит.
 *
 * @param user - Учётка, которой задали пароль.
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
 * Учётка создана: закрываем форму и сообщаем.
 *
 * Строку в список уже положила сама форма — ответом ручки, а не повторным
 * чтением: новая учётка может не попасть на экран под активным поиском или
 * фильтром, и подтверждением успеха остаётся тост.
 *
 * @param user - Созданная учётка.
 */
function handleUserCreated(user: IBricksUserSummary): void {
    emit('close-create-modal');
    emit('notify', t('bricks.users.toasts.created', { user: resolveUserLabel(user) }), 'success');
}

/**
 * Просит закрыть форму создания (кнопка «Отмена», крестик, Esc).
 */
function handleCloseCreateModal(): void {
    emit('close-create-modal');
}

/**
 * Просит открыть свой профиль на вкладке пароля: свой пароль меняется формой
 * профиля, где текущий обязателен.
 */
function handleChangeOwnPassword(): void {
    emit('change-own-password');
}
// #endregion

// #region Lifecycle
/*
    Список перечитывается на КАЖДОМ входе в раздел, а не только при первом.
    Учётки правит не один человек: между двумя открытиями раздела соседний
    администратор мог завести или выключить учётку, а созданная по оборванному
    запросу строка появляется в базе уже после того, как форма о ней сказала.
    Другого пути обновить список у раздела нет — кнопка повтора живёт только в
    экране отказа, — и без этого чтения показанное состояние держалось бы до
    перезагрузки страницы.

    Секция монтируется ровно при открытии раздела (хост рисует её слот по
    активному разделу), поэтому `onMounted` здесь и означает «вход в раздел».
    Чтение тихое: строки на экране не гаснут, спиннера при переключении не
    видно.
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
