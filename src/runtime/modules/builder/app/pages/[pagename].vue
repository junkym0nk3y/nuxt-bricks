<script setup lang="ts">
// #region Imports
// Types
import type { TMediaGalleryContext } from '../../../common/types/media';

// Vue
import {
    computed,
    defineAsyncComponent,
    onBeforeUnmount,
    onMounted,
    onScopeDispose,
    ref,
    watch,
} from 'vue';
import { useI18n } from 'vue-i18n';

// Nuxt
import { definePageMeta, useHead, useRouter, useCookie } from '#imports';

// Pinia
import { useComponentsStore } from '../../core/stores/components';
import { useSidebarStore } from '../../core/stores/sidebar';
import { usePublishStore } from '../../publish/stores/publish';
import { useInlineEditingStore } from '../../../text-editor/stores/inlineEditing';

// Composables
import { useBuilderPage } from '../composables/useBuilderPage';
import { useBuilderPageSelector } from '../composables/useBuilderPageSelector';
import { useBuilderSessionAddress } from '../composables/useBuilderSessionAddress';
import { useBuilderSession } from '../composables/useBuilderSession';
import { useBuilderSessionToken } from '../composables/useBuilderSessionToken';
import { useBuilderDraftPersistence } from '../composables/useBuilderDraftPersistence';
import { useBuilderSessionAddressSync } from '../composables/useBuilderSessionAddressSync';
import { useBuilderToast } from '../../core/composables/useBuilderToast';
import { useBuilderPermissions } from '../../core/composables/useBuilderPermissions';
import { usePropertiesPanelAvailability } from '../../core/composables/usePropertiesPanelAvailability';
import { useAuthProfile } from '../../auth/composables/useAuthProfile';
import { useAuthProfileModal } from '../../auth/composables/useAuthProfileModal';
import { useAuthSession } from '../../auth/composables/useAuthSession';

// Utils
import { createDraftStorageNotice } from '../utils/draftStorageNotice';
import { loadFavoritesFromStorage } from '../../core/stores/actions/favorites';
import { runSaveWhenSessionReady, withSessionReadyGuard } from '../utils/sessionGuards';
import { BRICKS_ROUTE_NAMES } from '../../../common/constants/routes';

// Components
import TheBuilderShellToolbar from '../../shell/toolbar/components/TheBuilderShellToolbar.vue';
import BuilderShellToolbarVerticalNav from '../../shell/toolbar/components/BuilderShellToolbarVerticalNav.vue';
import TheBuilderShellSidebar from '../../shell/sidebar/components/TheBuilderShellSidebar.vue';
import TheBuilderShellSidebarPropertiesPanel from '../../shell/sidebar/components/TheBuilderShellSidebarPropertiesPanel.vue';
import TheBuilderCanvas from '../../canvas/viewport/components/TheBuilderCanvas.vue';
import TheBuilderLoader from '../components/TheBuilderLoader.vue';
import TheBuilderSessionError from '../components/TheBuilderSessionError.vue';
import TheBuilderDraftRestoreModal from '../components/TheBuilderDraftRestoreModal.vue';
import BricksToast from '../../../ui/feedback/BricksToast.vue';

// Модалки — lazy-чанки: не нужны до открытия
const TheBuilderDocumentationModal = defineAsyncComponent(
    () => import('../../documentation/components/TheBuilderDocumentationModal.vue')
);
const TheBuilderMediaGalleryModal = defineAsyncComponent(
    () => import('../../media/components/TheBuilderMediaGalleryModal.vue')
);
// Создание страницы и резолвер картинок его импорта: монтируются по требованию
// (v-if ниже), иначе их чанки уехали бы к первому рендеру билдера — ленивыми они
// были бы только на бумаге
const TheBuilderPublishCreatePageModal = defineAsyncComponent(
    () => import('../../publish/components/TheBuilderPublishCreatePageModal.vue')
);
const TheBuilderMediaImageResolverModal = defineAsyncComponent(
    () => import('../../media/components/TheBuilderMediaImageResolverModal.vue')
);
// Профиль открывают из меню в углу тулбара — до этого ни разметка, ни чанк не
// нужны (в модалке форма пароля, кадрирование и vee-validate)
const TheBuilderAuthProfileModal = defineAsyncComponent(
    () => import('../../auth/components/TheBuilderAuthProfileModal.vue')
);
// #endregion

// #region Meta
definePageMeta({
    layout: 'bricks',
    // Статический page key: дефолтный key Nuxt — интерполированный path, из-за чего
    // смена :pagename перемонтировала бы страницу. Rename сессии (router.replace из
    // useBuilderSessionAddress.renameSession) остаётся на живом канвасе; навигация на другую
    // страницу обрабатывается watcher'ом useBuilderSession.
    key: 'bricks-builder-pagename',
});
// #endregion

// #region Data
const { t, locale, setLocale } = useI18n();
const router = useRouter();

const componentsStore = useComponentsStore();
const sidebarStore = useSidebarStore();
const publishStore = usePublishStore();

// Toast — модульный синглтон (useBuilderToast): нужен useBuilderSession раньше
// useBuilderPage (switchToSavedPage требуется useBuilderPage для Save as Copy)
const { showToast, showActionToast, hideToast } = useBuilderToast();

// Права и профиль сессии: на SSR оба приходят из контекста запроса, и до первого
// кадра известно, рисовать ли действия правки и чем наполнить аватар в углу.
// Досылка ручкой `me` нужна только сборкам без SSR — там контекста запроса нет
// вовсе, и уходит она ОДНА на два состояния: роль `ensureRole` берёт из уже
// полученного профиля
const { canEdit, canChangePassword, ensureRole } = useBuilderPermissions();
const { logout } = useAuthSession();
const { profile, ensureProfile } = useAuthProfile();
// Модалку профиля открывает меню в углу тулбара
const profileModal = useAuthProfileModal();

await ensureProfile();
await ensureRole(() => Promise.resolve(profile.value?.role ?? null));

// Токен сессии — общая точка отсечения операций, которые начинаются в одной
// сессии и завершаются в другой (сохранение, снимок превью, синк превью-вкладки,
// портальные модалки). Инкрементами владеет useBuilderSession, остальные читают
const sessionToken = useBuilderSessionToken();

// Общее на сессию сообщение о недоступном хранилище черновиков: о нём сообщают
// автосейв, открытие сессии и перенос черновика при rename. `stop()`
// регистрируется здесь, до всех остальных хуков очистки: cleanup идёт в порядке
// регистрации, а последним делом уходящей страницы будет синхронный сброс
// черновика — его отказ иначе показал бы тост уже поверх дашборда
const draftStorageNotice = createDraftStorageNotice({
    captureSessionToken: sessionToken.capture,
    // Дольше обычного: сообщение говорит о постоянном условии работы в этой
    // сессии, а не о разовой неудаче, и повторено оно не будет
    notify: () => showToast(t('bricks.publish.draft.storageUnavailable'), 'error', 10000),
});
onScopeDispose(() => {
    draftStorageNotice.stop();
});

// Владелец адреса: route.params — источник истины URL, sessionAddress — ключ черновиков
const { routeAddress, sessionAddress, renameSession } = useBuilderSessionAddress({
    draftStorageNotice,
});

// Сессия билдера: открытие страницы, черновики, модалка восстановления,
// единый переход на сохранённую копию (switchToSavedPage)
const {
    isSessionLoading,
    isSessionReady,
    sessionError,
    sessionPageId,
    isDraftRestorePending,
    isRestoreDraftModalOpen,
    pendingDraft,
    savedSnapshot,
    buildCurrentSnapshot,
    commitSavedSnapshot,
    switchToSavedPage,
    openBuilderSession,
    retryBuilderSession,
    openRestoreDraftModal,
    handleDeferDraft,
    handleRestoreDraft,
    handleDiscardDraft,
} = useBuilderSession({
    routeAddress,
    sessionAddress,
    showToast,
    renameSession,
    sessionToken,
    draftStorageNotice,
    canEdit,
});

// Мост inline-редактора: editor подключается только здесь (composition root)
const inlineEditingStore = useInlineEditingStore();
const builder = await useBuilderPage({
    inlineMediaBridge: {
        isRequestingMedia: computed(() => inlineEditingStore.isRequestingMedia),
        resolveMediaRequest: (item) => inlineEditingStore.resolveMediaRequest(item),
        cancelMediaRequest: () => inlineEditingStore.cancelMediaRequest(),
        cancelInlineEditing: () => inlineEditingStore.stopEditing(),
    },
    renameSession,
    switchToSavedPage,
    commitSavedSnapshot,
    sessionToken,
});

const {
    componentLibraryList,
    skippedBricks,
    isComponentLibraryLoadFailed,
    isComponentLibraryLoading,
    handleRetryComponentLibrary,
    notifyComponentLibraryFailure,
    isDocumentationModalOpen,
    shouldMountMediaGallery,
    isMediaGalleryModalOpen,
    mediaGalleryContext,
    sidebarRef,
    propertiesPanelRef,
    toast,
    isEditingExistingPage,
    hasSelectedComponent,
    leftSidebarOffset,
    currentPublishPageTitle,
    handleKeyDown,
    handleToggleLibrary,
    handleToggleSchema,
    handleOpenPublishSettings,
    handleOpenDocs,
    handleCloseDocs,
    handleMediaError,
    handleOpenMediaGallery,
    handleCloseMediaGallery,
    handleMediaSelect,
    handleSaveDraft,
    handleSaveAsCopy,
    handlePreview,
} = builder;

// Лоадер на экране. Отдельно от `isSessionReady`, потому что расходятся они
// всегда: сессия открывается быстрее, чем идёт цикл анимации лоадера, и в этом
// хвосте (до ~2 с на быстрой загрузке) интерфейс уже отпущен, а пользователь
// видит «идёт загрузка» — клики в тулбар и рейл уходили под лоадер. Начальное
// true: лоадер монтируется вместе со страницей, `isSessionLoading` стартует
// поднятым
const isLoaderVisible = ref(true);

// Номер показа тоста с предложением восстановить черновик: им же он и гасится,
// когда предложение снимается первой правкой пользователя. Гасим по номеру, а не
// флагом видимости, — состояние тоста одно на приложение, и чужое сообщение,
// успевшее заменить наше, снимать нельзя
const draftToastToken = ref<number | null>(null);

const darkModeCookie = useCookie<boolean>('bricks-dark-mode', {
    default: () => false,
    maxAge: 60 * 60 * 24 * 365,
});
const isDarkMode = ref(darkModeCookie.value ?? false);

// Селектор страниц в тулбаре: список, переход и создание новой страницы
const {
    isPagesRefreshing,
    shouldMountCreatePageModal,
    isCreatePageModalOpen,
    schemaImport,
    handleOpenPageSelector,
    handleSelectPage,
    handleOpenCreatePage,
    handleCloseCreatePage,
    handlePageCreated,
} = useBuilderPageSelector({
    sessionPageId,
    routeAddress,
    sessionToken,
    showToast,
});

// Горячие клавиши — только в согласованную сессию: обработчик висит на window,
// поэтому ни щит, ни inert его не останавливают (правило — в sessionGuards)
const handleGuardedKeyDown = withSessionReadyGuard<KeyboardEvent>(
    () => isSessionReady.value,
    handleKeyDown
);

// Автосохранение черновика (debounce) + синхронизация URL с адресом формы
useBuilderDraftPersistence({
    routeAddress,
    sessionAddress,
    isSessionLoading,
    isSessionReady,
    isDraftRestorePending,
    savedSnapshot,
    buildCurrentSnapshot,
    draftStorageNotice,
    canEdit,
});
useBuilderSessionAddressSync({ renameSession, isSessionReady });

// Правая панель свойств монтируется ниже по `canEdit` — сайдбар-стор обязан
// знать об этом, иначе выбор блока резервирует её ширину и роли без панели
usePropertiesPanelAvailability(canEdit);
// #endregion

// #region Computed
const toastDuration = computed<number>(() => toast.duration ?? 4000);

// Интерфейс закрыт, пока сессия не согласована ИЛИ пока на экране лоадер: он
// обещает, что работать ещё нельзя, и это обещание должно быть правдой.
// Экран ошибки — исключение: он сам перекрывает рабочую область и держит
// единственные оставшиеся действия (повтор и уход на дашборд)
const isBuilderLocked = computed<boolean>(
    () => !sessionError.value && (!isSessionReady.value || isLoaderVisible.value)
);
const isPublishSettingsComplete = computed<boolean>(() => {
    const { pagename, title, description } = publishStore.currentFormState;
    return Boolean((pagename ?? '').trim() && (title ?? '').trim() && (description ?? '').trim());
});

const isLibraryActive = computed<boolean>(
    () => sidebarStore.left.visible && sidebarStore.activeView === 'components'
);
const isPublishSettingsActive = computed<boolean>(
    () => sidebarStore.left.visible && sidebarStore.activeView === 'publish'
);
const isSchemaActive = computed<boolean>(
    () => sidebarStore.left.visible && sidebarStore.activeView === 'schema'
);
// #endregion

// #region Methods
/**
 * Открывает менеджер страниц — полноэкранный дашборд `/bricks`.
 * Несохранённые изменения переживают переход через черновик (draft persistence).
 */
async function handleOpenPagesManager(): Promise<void> {
    await router.push({ name: BRICKS_ROUTE_NAMES.builderIndex });
}

/**
 * Повторяет открытие сессии с блокирующего экрана ошибки.
 */
async function handleRetrySession(): Promise<void> {
    await retryBuilderSession();
}

/**
 * Держит на экране предложение восстановить черновик, пока на него не ответили:
 * тост — единственный путь к окну с выбором, и потерять его нельзя. Уехать он
 * может не только по воле пользователя — например, его вытеснит чужое сообщение
 * (состояние тоста одно на приложение).
 */
function ensureDraftToast(): void {
    const isOwnToastVisible =
        draftToastToken.value !== null && toast.visible && toast.token === draftToastToken.value;

    if (!isDraftRestorePending.value || isOwnToastVisible) {
        return;
    }

    draftToastToken.value = showActionToast({
        message: t('bricks.publish.draft.pendingTitle'),
        actionLabel: t('bricks.publish.draft.pendingAction'),
        variant: 'info',
        // Кнопка — короткий путь: пользователь уже выбрал восстановление, и окно
        // спросило бы то же самое второй раз. Клик по телу ведёт в окно: там дата
        // черновика и удаление
        onAction: handleRestoreDraft,
        onSelect: openRestoreDraftModal,
    });
}

/**
 * Лоадер ушёл с экрана: интерфейс отпускается, и если у сессии есть
 * неотвеченный черновик — самое время предложить его. Раньше нельзя: модалка и
 * тост посреди загрузки ломали бы вид лоадера.
 */
function handleLoaderHidden(): void {
    isLoaderVisible.value = false;
    ensureDraftToast();
}

/**
 * Сохраняет страницу, если сессия согласована (правило — в `runSaveWhenSessionReady`).
 */
async function handleSaveDraftGuarded(): Promise<void> {
    await runSaveWhenSessionReady({
        isSessionReady: () => isSessionReady.value,
        save: handleSaveDraft,
        onBlocked: () => showToast(t('bricks.publish.session.saveBlocked'), 'error'),
    });
}

/**
 * Сохраняет страницу копией, если сессия согласована.
 */
async function handleSaveAsCopyGuarded(): Promise<void> {
    await runSaveWhenSessionReady({
        isSessionReady: () => isSessionReady.value,
        save: handleSaveAsCopy,
        onBlocked: () => showToast(t('bricks.publish.session.saveBlocked'), 'error'),
    });
}

/**
 * Делегирует открытие галереи медиа с контекстом.
 *
 * @param context - Контекст вызова.
 */
function handleOpenMediaGalleryWithContext(context?: TMediaGalleryContext): void {
    handleOpenMediaGallery(context);
}

/**
 * Переключает тёмную/светлую тему билдера и сохраняет выбор в cookie.
 */
function handleToggleDarkMode(): void {
    isDarkMode.value = !isDarkMode.value;
    darkModeCookie.value = isDarkMode.value;
}

/**
 * Переключает локаль интерфейса (ru ⇄ en); cookie `bricks-locale` пишет сам i18n.
 */
async function handleToggleLocale(): Promise<void> {
    await setLocale(locale.value === 'ru' ? 'en' : 'ru');
}

/**
 * Выходит из сессии; при отказе показывает тост.
 *
 * Подтверждения нет намеренно: несохранённая правка не теряется — переход уводит
 * страницу, а `pagehide` синхронно допишет отложенный черновик, и после входа
 * билдер предложит его восстановить.
 */
async function handleLogout(): Promise<void> {
    try {
        await logout();
    } catch {
        showToast(t('bricks.auth.logoutFailed'), 'error');
    }
}
// #endregion

// #region Watchers
// Переоткрытие сессии (навигация на другую страницу билдера) заново поднимает
// лоадер — вместе с ним возвращается и блокировка
watch(isSessionLoading, (isLoading) => {
    if (!isLoading) {
        return;
    }

    isLoaderVisible.value = true;
});

// Предложение снято — снимаем и тост: его собственный жизненный цикл кончается
// вместе с предложением, в том числе когда его вытеснила первая правка
// пользователя (восстанавливать после неё нечего — автосейв уже перезаписал
// черновик текущим состоянием)
watch(isDraftRestorePending, (isPending) => {
    if (isPending || draftToastToken.value === null) {
        return;
    }

    hideToast(draftToastToken.value);
    draftToastToken.value = null;
});

// Окно закрыли без ответа — вопрос возвращается на экран (см. `ensureDraftToast`).
// На ответах сюда же приходит уже снятое предложение, и показывать нечего
watch(isRestoreDraftModalOpen, (isOpen) => {
    if (isOpen) {
        return;
    }

    ensureDraftToast();
});
// #endregion

// #region Lifecycle
/**
 * Класс body формируется реактивно — включает bricks-dark при активной тёмной теме.
 * Работает на SSR: cookie читается на сервере, класс рендерится сразу.
 */
const bodyClass = computed(() => (isDarkMode.value ? 'bricks-page bricks-dark' : 'bricks-page'));

useHead({
    bodyAttrs: {
        class: bodyClass,
    },
});

onMounted(() => {
    window.addEventListener('keydown', handleGuardedKeyDown);
    componentsStore.favorites = loadFavoritesFromStorage();
    notifyComponentLibraryFailure();

    if (routeAddress.value.pagename) {
        openBuilderSession(routeAddress.value).catch((error: unknown) => {
            console.error('[Builder] Failed to open builder session:', error);
        });
    }
});

onBeforeUnmount(() => {
    window.removeEventListener('keydown', handleGuardedKeyDown);
});
// #endregion
</script>

<template>
    <div :class="[$style.BricksBuilder, 'bricks-text']">
        <!--
            inert и на тулбаре: блокировщик ниже держит только мышь, а тулбар —
            сосед рабочей области, и Tab из него уводил бы в кнопки недозагруженной
            сессии
        -->
        <TheBuilderShellToolbar
            :inert="isBuilderLocked"
            :is-editing-existing-page="isEditingExistingPage"
            :is-submitting-publish="publishStore.isSubmitting"
            :has-selected-component="hasSelectedComponent"
            :is-publish-settings-complete="isPublishSettingsComplete"
            :is-session-ready="isSessionReady"
            :sidebar-offset="leftSidebarOffset"
            :page-title="currentPublishPageTitle"
            :pages="publishStore.publishedPages"
            :current-page-id="sessionPageId"
            :is-pages-loaded="publishStore.pagesLoadedAt !== null"
            :is-pages-loading="isPagesRefreshing"
            :is-submitting-page="publishStore.isSubmitting"
            @open-pages-manager="handleOpenPagesManager"
            @open-page-selector="handleOpenPageSelector"
            @select-page="handleSelectPage"
            @create-page="handleOpenCreatePage"
            @open-media-gallery="handleOpenMediaGalleryWithContext"
            @save-draft="handleSaveDraftGuarded"
            @save-as-copy="handleSaveAsCopyGuarded"
            @preview="handlePreview"
            @open-profile="profileModal.open"
            @logout="handleLogout"
        />

        <div :class="$style.content">
            <!--
                inert на всё время незавершённой сессии: блокировщик держит только
                мышь, а Tab, уже сфокусированное поле и accessibility tree он не
                закрывает — правка через клавиатуру всё равно потерялась бы молча
            -->
            <div :class="$style.workspace" :inert="isBuilderLocked">
                <BuilderShellToolbarVerticalNav
                    :is-library-active="isLibraryActive"
                    :is-schema-active="isSchemaActive"
                    :is-publish-settings-active="isPublishSettingsActive"
                    :is-publish-settings-complete="isPublishSettingsComplete"
                    :is-dark-mode="isDarkMode"
                    @toggle-library="handleToggleLibrary"
                    @toggle-schema="handleToggleSchema"
                    @open-publish-settings="handleOpenPublishSettings"
                    @open-docs="handleOpenDocs"
                    @toggle-dark-mode="handleToggleDarkMode"
                    @toggle-locale="handleToggleLocale"
                />

                <TheBuilderShellSidebar
                    ref="sidebarRef"
                    :components="componentLibraryList"
                    :skipped-bricks="skippedBricks"
                    :is-library-load-failed="isComponentLibraryLoadFailed"
                    :is-library-loading="isComponentLibraryLoading"
                    @open-media-gallery="handleOpenMediaGalleryWithContext"
                    @retry-library="handleRetryComponentLibrary"
                />

                <!--
                    Панель свойств — редакторская поверхность целиком: у роли
                    наблюдателя она не монтируется вовсе, а не гасится полями.
                    Выбор блока при этом работает — он же подсветка на канвасе
                -->
                <TheBuilderShellSidebarPropertiesPanel
                    v-if="canEdit"
                    ref="propertiesPanelRef"
                    @open-media-gallery="handleOpenMediaGalleryWithContext('properties')"
                />

                <div :class="$style.canvasWrapper">
                    <TheBuilderLoader :is-loading="isSessionLoading" @hidden="handleLoaderHidden" />
                    <TheBuilderCanvas />
                </div>
            </div>

            <!--
                Сессия не открылась: экран перекрывает всю рабочую область, включая
                сайдбары, — правки канваса и настроек публикации отклоняются
                автосейвом по !isSessionReady, то есть терялись бы молча
            -->
            <TheBuilderSessionError
                v-if="sessionError"
                :message="sessionError"
                :is-retrying="isSessionLoading"
                @retry="handleRetrySession"
                @open-pages-manager="handleOpenPagesManager"
            />
        </div>

        <!--
            Пока сессия открывается или пока на экране лоадер: правка до готовности
            либо затирается пришедшей схемой, либо уезжает в savedSnapshot как «уже
            сохранённая» — и теряется на reload. Лежит в корне, а не в .content:
            тулбар — сосед рабочей области, и внутри неё он не закрывался, а из его
            кнопок открыт был выход на дашборд — тот самый путь, на котором правки и
            терялись
        -->
        <div v-if="isBuilderLocked" :class="$style.sessionBlocker" aria-hidden="true"></div>

        <TheBuilderAuthProfileModal
            v-if="profileModal.shouldMount.value"
            :is-open="profileModal.isOpen.value"
            :can-change-password="canChangePassword"
            @close="profileModal.close"
            @notify="showToast"
        />

        <TheBuilderDocumentationModal
            :is-open="isDocumentationModalOpen"
            @close="handleCloseDocs"
        />

        <TheBuilderMediaGalleryModal
            v-if="shouldMountMediaGallery"
            :visible="isMediaGalleryModalOpen"
            :context="mediaGalleryContext"
            @close="handleCloseMediaGallery"
            @error="handleMediaError"
            @select="handleMediaSelect"
        />

        <TheBuilderPublishCreatePageModal
            v-if="shouldMountCreatePageModal"
            :is-open="isCreatePageModalOpen"
            :resolve-imported-schema="schemaImport.resolveSchemaForCreate"
            @close="handleCloseCreatePage"
            @created="handlePageCreated"
        />

        <TheBuilderMediaImageResolverModal
            v-if="schemaImport.shouldMountResolver.value"
            :is-open="schemaImport.isResolverModalOpen.value"
            :state="schemaImport.resolverState"
            @confirm="schemaImport.handleResolverConfirm"
            @cancel="schemaImport.handleResolverCancel"
            @skip="schemaImport.handleResolverSkip"
            @set-image-action="schemaImport.handleSetImageAction"
            @set-global-action="schemaImport.handleSetGlobalAction"
        />

        <TheBuilderDraftRestoreModal
            :is-open="isRestoreDraftModalOpen"
            :updated-at="pendingDraft?.updatedAt"
            @close="handleDeferDraft"
            @restore="handleRestoreDraft"
            @discard="handleDiscardDraft"
        />

        <BricksToast
            v-model:visible="toast.visible"
            :message="toast.message"
            :variant="toast.variant"
            :duration="toastDuration"
            :auto-hide="toast.autoHide"
            :action-label="toast.actionLabel"
            @action="toast.onAction?.()"
            @select="toast.onSelect?.()"
        />
    </div>
</template>

<style module lang="scss">
.BricksBuilder {
    overflow: hidden;
    display: flex;
    width: 100vw;
    height: 100vh;
    background-color: var(--bricks-workspace-bg);
    flex-direction: column;
}

.content {
    position: relative;
    overflow: hidden;
    display: flex;
    flex: 1;
}

/* Обёртка рабочей области — носитель inert; раскладку .content повторяет один в один */
.workspace {
    display: flex;
    flex: 1;
    min-width: 0;
}

.canvasWrapper {
    position: relative;
    overflow: hidden;
    display: flex;
    flex: 1;
}

/*
 * Блокировщик на время открытия сессии. До готовности правки терять нельзя, а
 * именно это и происходило: автосейв их отклоняет по !isSessionReady, канвас
 * потом затирается пришедшей схемой, а правка формы уезжает в savedSnapshot как
 * «уже сохранённая» — черновик не создаётся, и reload её теряет. Лоадер не
 * защита: он закрывает только канвас.
 *
 * Прозрачный и без собственного вида: подменять фон полупрозрачной вуалью, как
 * было, — значит объяснять ожидание сменой цвета, которую пользователь читает
 * как «интерфейс сломался». Единственный видимый признак — курсор.
 *
 * position: fixed, потому что корень билдера не позиционирован; слой
 * `--bricks-z-blocking` — выше оболочки и модалок, но ниже тоста, чтобы
 * сообщение о недоступном хранилище оставалось закрываемым, и ниже лоадера.
 */
.sessionBlocker {
    position: fixed;
    z-index: var(--bricks-z-blocking);
    background: transparent;
    cursor: progress;
    inset: 0;
}
</style>
