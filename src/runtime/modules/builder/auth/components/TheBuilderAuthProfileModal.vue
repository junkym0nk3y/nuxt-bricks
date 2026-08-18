<script setup lang="ts">
/**
 * @description Модалка своего профиля: вкладка «Профиль» (фото, отображаемое
 * имя, логин и роль на просмотр) и вкладка «Пароль» (смена своего пароля).
 *
 * Две вкладки вместо двух модалок: обе правят одну учётку, и разделение
 * заставляло бы искать, из какого угла экрана открывается вторая. При
 * `allowPasswordChange: false` вкладок нет вовсе — остаётся одна форма, потому
 * что дорожка из одного таба сообщает о выборе, которого нет.
 *
 * Переключатель — `BricksTabBar`, то есть группа кнопок с `aria-pressed`, а не
 * `role="tablist"`. Решение осознанное: семантика вкладок обещает скринридеру
 * панель на каждую вкладку и активирует таб при получении фокуса, а вводить
 * второй примитив табов ради двух форм в одной модалке значило бы дублировать
 * стили пилюль ради обещания, которое здесь ничего не меняет.
 *
 * Кадрирование живёт в отдельной вложенной модалке: показ круга требует своего
 * кадра и своего футера («Сохранить фото»), а прятать его внутрь формы —
 * значит смешивать два разных шага.
 */

// #region Imports
// Types
import type {
    IAuthProfileModalProps,
    IAuthProfileModalEmits,
    TAuthProfileTab,
} from '../types/auth';

// Vue
import { computed, ref, shallowRef, watch } from 'vue';
import { useI18n } from 'vue-i18n';

// Constants
import { BRICKS_AVATAR_MAX_UPLOAD_MB } from '../../../common/constants/auth';

// Composables
import { useAuthProfile } from '../composables/useAuthProfile';

// Components
import BricksModal from '../../../ui/base/modal/BricksModal.vue';
import BricksCloseButton from '../../../ui/base/modal/BricksCloseButton.vue';
import BricksTabBar from '../../../ui/base/tabs/BricksTabBar.vue';
import BuilderAuthProfileAvatarCropModal from './BuilderAuthProfileAvatarCropModal.vue';
import BuilderAuthProfileDetailsForm from './BuilderAuthProfileDetailsForm.vue';
import BuilderAuthProfilePasswordForm from './BuilderAuthProfilePasswordForm.vue';
// #endregion

// #region Props
const props = withDefaults(defineProps<IAuthProfileModalProps>(), {
    canChangePassword: false,
    initialTab: 'profile',
});
// #endregion

// #region Emits
const emit = defineEmits<IAuthProfileModalEmits>();
// #endregion

// #region Data
const { t } = useI18n();
const { profile } = useAuthProfile();

/** Выбранная вкладка; при выключенной смене пароля вторая недостижима. */
const activeTab = ref<TAuthProfileTab>('profile');

/**
 * Выбранный для кадрирования файл; null — вложенная модалка закрыта.
 *
 * `shallowRef`, а не `ref`: обычный делает значение глубоко реактивным, то есть
 * заворачивает файл в Proxy, — а он уезжает в `FormData` и в `decode()`, где
 * нужен сам блоб, а не его обёртка. Реактивность внутри файла к тому же
 * бессмысленна: он неизменяем.
 */
const pendingPhoto = shallowRef<File | null>(null);
const isCropModalOpen = ref(false);
const fileInputRef = ref<HTMLInputElement | null>(null);
// #endregion

// #region Computed
const tabs = computed(() => [
    { value: 'profile', label: t('bricks.auth.profile.tabs.profile') },
    { value: 'password', label: t('bricks.auth.profile.tabs.password') },
]);
// #endregion

// #region Methods
/**
 * Закрывает модалку профиля.
 *
 * Пока открыто кадрирование, закрытие не проходит: Esc в кропе иначе снял бы
 * обе модалки разом, а отменить он должен только выбор области. Через этот же
 * guard идут «Отмена» и «Сохранить» форм — иначе закрытие имело бы два пути, и
 * один из них обходил бы условие.
 */
function handleClose(): void {
    if (isCropModalOpen.value) {
        return;
    }

    emit('close');
}

/**
 * Переключает вкладку.
 *
 * @param value - Значение выбранного таба.
 */
function handleSelectTab(value: string): void {
    activeTab.value = value === 'password' ? 'password' : 'profile';
}

/**
 * Открывает системный выбор файла — кадрирование начинается с него.
 */
function handlePickPhoto(): void {
    fileInputRef.value?.click();
}

/**
 * Принимает выбранный файл и открывает кадрирование.
 *
 * Значение поля сбрасывается сразу: без этого повторный выбор того же файла не
 * даёт события `change`, и второй заход на то же фото выглядел бы как
 * неработающая кнопка.
 *
 * Размер проверяется здесь — единственная проверка содержимого, которую честно
 * сделать на клиенте: тип подтверждает сигнатура на сервере (заявить `image/png`
 * может кто угодно), а вот гонять через сеть файл, заведомо обречённый на 413,
 * незачем. Потолок — та же константа, которой отказывает ручка.
 *
 * @param event - Событие поля выбора файла.
 */
function handleFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;

    input.value = '';

    if (!file) {
        return;
    }

    if (file.size > BRICKS_AVATAR_MAX_UPLOAD_MB * 1024 * 1024) {
        emit(
            'notify',
            t('bricks.auth.profile.errors.avatarTooLarge', { max: BRICKS_AVATAR_MAX_UPLOAD_MB }),
            'error'
        );

        return;
    }

    pendingPhoto.value = file;
    isCropModalOpen.value = true;
}

/**
 * Закрывает кадрирование, не применяя фото.
 */
function handleCloseCrop(): void {
    isCropModalOpen.value = false;
}

/**
 * Кадрирование ушло из DOM — снимаем файл.
 *
 * Именно по уходу, а не по закрытию: `force-mount` держит уезжающую модалку до
 * конца анимации, и снятый в начале файл оставил бы человека смотреть на пустой
 * кадр всё время, пока она гаснет.
 */
function handleCropAfterLeave(): void {
    pendingPhoto.value = null;
}

/**
 * Фото применено: кадрирование закрывается, а ссылку в состоянии профиля уже
 * обновил ответ ручки.
 */
function handlePhotoUploaded(): void {
    isCropModalOpen.value = false;
    emit('notify', t('bricks.auth.profile.toasts.photoSaved'), 'success');
}

/**
 * Пробрасывает сообщение формы наверх — тост показывает хост.
 *
 * @param message - Текст сообщения.
 * @param variant - Тип сообщения.
 */
function handleNotify(message: string, variant: 'success' | 'error'): void {
    emit('notify', message, variant);
}
// #endregion

// #region Lifecycle
// Вкладка выбирается на КАЖДОМ открытии по запрошенной, а не запоминается между
// ними: точек входа две — меню профиля просит «Профиль», ключ в своей строке
// раздела учёток просит «Пароль», — и вкладка, оставшаяся с прошлого раза,
// показала бы человеку не то, что он открывал. При выключенной смене пароля
// запрос пароля безопасно сводится к профилю: вкладки в этом режиме нет вовсе
watch(
    () => props.isOpen,
    (isOpen) => {
        if (!isOpen) {
            activeTab.value = 'profile';
            return;
        }

        activeTab.value =
            props.initialTab === 'password' && props.canChangePassword ? 'password' : 'profile';
    },
    { immediate: true }
);

// Выключение смены пароля посреди открытой модалки (перечитанный конфиг) не
// должно оставить экран на недостижимой вкладке
watch(
    () => props.canChangePassword,
    (isAllowed) => {
        if (!isAllowed) {
            activeTab.value = 'profile';
        }
    }
);
// #endregion
</script>

<template>
    <BricksModal
        :is-open="props.isOpen"
        :title="t('bricks.auth.profile.title')"
        variant="gradient"
        padded
        @close="handleClose"
    >
        <div :class="$style.TheBuilderAuthProfileModal">
            <div :class="$style.header">
                <h3 :class="$style.title">{{ t('bricks.auth.profile.title') }}</h3>
                <BricksCloseButton @click="handleClose" />
            </div>

            <div :class="$style.body">
                <BricksTabBar
                    v-if="props.canChangePassword"
                    :class="$style.tabs"
                    :model-value="activeTab"
                    :items="tabs"
                    :group-label="t('bricks.auth.profile.tabsLabel')"
                    @update:model-value="handleSelectTab"
                />

                <!--
                    Профиль приходит из общего состояния сессии; без него рисовать
                    нечего — модалку в этот момент открыть невозможно (аватар,
                    который её открывает, тоже не отрисован)
                -->
                <BuilderAuthProfileDetailsForm
                    v-if="profile && activeTab === 'profile'"
                    :profile="profile"
                    @pick-photo="handlePickPhoto"
                    @close="handleClose"
                    @notify="handleNotify"
                />

                <BuilderAuthProfilePasswordForm
                    v-else-if="props.canChangePassword && activeTab === 'password'"
                    @close="handleClose"
                />
            </div>

            <input
                ref="fileInputRef"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                :class="$style.hiddenInput"
                @change="handleFileSelected"
            />
        </div>
    </BricksModal>

    <BuilderAuthProfileAvatarCropModal
        :is-open="isCropModalOpen"
        :file="pendingPhoto"
        @close="handleCloseCrop"
        @uploaded="handlePhotoUploaded"
        @after-leave="handleCropAfterLeave"
    />
</template>

<style module lang="scss">
.TheBuilderAuthProfileModal {
    overflow: hidden;
    display: flex;
    width: 100%;
    max-width: 52rem;
    flex-direction: column;
    border-radius: var(--bricks-border-radius-md);
    background: var(--bricks-base-0);
    box-shadow: var(--bricks-shadow-lg);
}

.header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1.6rem 2rem;
    border-bottom: 1px solid var(--bricks-base-200);
}

.title {
    margin: 0;
    font-size: 1.8rem;
    font-weight: 700;
    color: var(--bricks-base-900);
}

.body {
    display: flex;
    flex-direction: column;
    padding: 2rem;
    gap: 1.6rem;
}

.tabs {
    align-self: flex-start;
}

.hiddenInput {
    display: none;
}
</style>
