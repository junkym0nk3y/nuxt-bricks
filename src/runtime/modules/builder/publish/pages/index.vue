<script setup lang="ts">
// #region Imports
// Types
import type { TPublishedPageSummary } from '../../../common/types/bricks-api';
import type { IMediaItem } from '../../../common/types/media';
import type { TPublishDashboardSection } from '../types/dashboard';
import type { IBricksPageAddress } from '../../../common/types/pageAddress';

// Utils
import {
    getBuilderPageRouteLocation,
    toPageAddress,
} from '../../../common/utils/bricks/pageAddress';

// Vue
import { computed, defineAsyncComponent, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';

// Nuxt
import { useRouter, useHead } from '#imports';

// Pinia
import { usePublishStore } from '../stores/publish';

// Composables
import { useAuthProfile } from '../../auth/composables/useAuthProfile';
import { useAuthProfileModal } from '../../auth/composables/useAuthProfileModal';
import { useAuthSession } from '../../auth/composables/useAuthSession';
import { useBuilderPermissions } from '../../core/composables/useBuilderPermissions';
import { useBuilderToast } from '../../core/composables/useBuilderToast';
import { usePublishDashboard } from '../composables/usePublishDashboard';
import { usePublishDashboardPreferences } from '../composables/usePublishDashboardPreferences';
import { usePublishMediaGallery } from '../composables/usePublishMediaGallery';
import { usePublishPageActions } from '../composables/usePublishPageActions';
import { usePublishPageDelete } from '../composables/usePublishPageDelete';
import { usePublishPagesData } from '../composables/usePublishPagesData';
import { usePublishVersionRestore } from '../composables/usePublishVersionRestore';
import { usePublishSchemaImport } from '../composables/usePublishSchemaImport';
import { useUsersData } from '../../users/composables/useUsersData';

// Components
import TheBuilderPublishDashboard from '../components/TheBuilderPublishDashboard.vue';
import BuilderPublishPagesList from '../components/BuilderPublishPagesList.vue';
import BuilderPublishDetailsPanel from '../components/BuilderPublishDetailsPanel.vue';
import TheBuilderPublishCreatePageModal from '../components/TheBuilderPublishCreatePageModal.vue';
import BuilderMediaGalleryPreviewLightbox from '../../media/components/BuilderMediaGalleryPreviewLightbox.vue';
import TheBuilderUsersSection from '../../users/components/TheBuilderUsersSection.vue';
import BuilderAuthDefaultPasswordNotice from '../../auth/components/BuilderAuthDefaultPasswordNotice.vue';
import BricksConfirmModal from '../../../ui/feedback/BricksConfirmModal.vue';
import BricksToast from '../../../ui/feedback/BricksToast.vue';

// Модалки — lazy-чанки: не нужны до открытия (документация тянет markdown-it и статьи)
const TheBuilderDocumentationModal = defineAsyncComponent(
    () => import('../../documentation/components/TheBuilderDocumentationModal.vue')
);
const TheBuilderMediaGalleryModal = defineAsyncComponent(
    () => import('../../media/components/TheBuilderMediaGalleryModal.vue')
);
// Профиль открывают с меню в углу — до этого модалка не нужна ни разметкой, ни
// чанком (в ней форма пароля, кадрирование и vee-validate)
const TheBuilderAuthProfileModal = defineAsyncComponent(
    () => import('../../auth/components/TheBuilderAuthProfileModal.vue')
);
// Резолвер картинок нужен только импорту схемы — держим его в отдельном чанке.
// Условие монтирования в шаблоне обязательно: без него чанк уехал бы к первому
// рендеру дашборда, и ленивым импорт был бы только на бумаге
const TheBuilderMediaImageResolverModal = defineAsyncComponent(
    () => import('../../media/components/TheBuilderMediaImageResolverModal.vue')
);
// #endregion

// #region Data
const { t } = useI18n();
const router = useRouter();
const publishStore = usePublishStore();
const { toast, showToast } = useBuilderToast();
const { logout } = useAuthSession();
// Композабл создаётся здесь, синхронно: внутри `useState`/`useRequestEvent`, а
// они обязаны вызваться до первого `await` этого setup — досылка профиля идёт
// ниже, вместе с ролью
const { profile, ensureProfile } = useAuthProfile();
// Модалку профиля открывает меню в углу шапки
const profileModal = useAuthProfileModal();
const { canChangePassword, canManageUsers, ensureRole } = useBuilderPermissions();
const { searchQuery, activeFilter, filterCounts, filteredPages, hasAnyPages } = usePublishDashboard(
    computed(() => publishStore.publishedPages)
);
const {
    duplicatingPageId,
    thumbnailPreviewItem,
    togglePublished,
    duplicatePage,
    previewPage,
    previewThumbnail,
    closeThumbnailPreview,
} = usePublishPageActions({ onNotify: showToast });
const { isDarkMode, bodyClass, toggleDarkMode, toggleLocale } = usePublishDashboardPreferences();
const mediaGallery = usePublishMediaGallery();
// Список учёток нужен дашборду и до открытия раздела: пункт рейла показывает
// счётчик. Сам раздел читает то же состояние — оно одно на приложение
const { usersCount, status: usersStatus, ensureUsers } = useUsersData();

const activeSection = ref<TPublishDashboardSection>('pages');
const isCreatePageModalOpen = ref(false);
const isCreateUserModalOpen = ref(false);
/**
 * Поисковый запрос раздела учёток — свой, а не общий с страницами: запрос,
 * набранный для страниц, отфильтровал бы список людей до пустого, и раздел
 * выглядел бы сломанным.
 */
const usersSearchQuery = ref('');
const isDocumentationModalOpen = ref(false);

const {
    isRestoreConfirmationOpen,
    isRestoring,
    restoreConfirmationDescription,
    requestRestoreVersion,
    closeRestoreConfirmation,
    confirmRestoreVersion,
} = usePublishVersionRestore({ onNotify: showToast });
const selectedPageId = ref<string | null>(null);
const detailsPanelRef = ref<InstanceType<typeof BuilderPublishDetailsPanel> | null>(null);

const {
    isDeleteConfirmationOpen,
    isDeleting,
    deleteConfirmationDescription,
    requestDeletePage,
    closeDeleteConfirmation,
    confirmDeletePage,
} = usePublishPageDelete({
    onNotify: showToast,
    onDeleted: (pageId) => {
        if (selectedPageId.value === pageId) {
            selectedPageId.value = null;
        }
    },
});

// Импорт схемы: подтверждение замены, резолвинг картинок и запись. Живёт здесь,
// а не в панели деталей, потому что обслуживает и модалку создания, и потому что
// его модалки телепортированы в body — то есть переживают и смену выбранной
// страницы, и закрытие панели. Не разбирается по именам: полями пользуется
// только шаблон, а россыпь из семнадцати переменных читается хуже
const schemaImport = usePublishSchemaImport({
    onNotify: showToast,
    isTargetSelected: (pageId) => selectedPageId.value === String(pageId),
});

// #endregion

// #region Computed
const pagesCount = computed<number>(() => publishStore.publishedPages.length);
const toastDuration = computed<number>(() => toast.duration ?? 4000);

/**
 * Выбранная страница — из store, чтобы панель видела результат patch/удаления.
 */
const selectedPage = computed<TPublishedPageSummary | null>(() => {
    if (selectedPageId.value === null) {
        return null;
    }
    return publishStore.getPageById(selectedPageId.value) ?? null;
});

/**
 * Раздел «Пользователи» показывается, когда права есть И ручки отвечают:
 * `unavailable` ставится на 403 и 404 первой загрузки, то есть «раздела в этой
 * установке нет». Оставить пункт в этом состоянии значило бы вести человека на
 * пустой экран, который ничем не наполнится.
 */
const isUsersSectionVisible = computed<boolean>(
    () => canManageUsers.value && usersStatus.value !== 'unavailable'
);

/** Своя учётка: её строка в списке помечается и теряет часть действий. */
const currentUserId = computed<number | null>(() => profile.value?.id ?? null);

/**
 * Запрос из поля поиска шапки — того раздела, который открыт. Своё значение у
 * каждого раздела: у страниц и учёток разные списки, и общая строка искала бы в
 * одном по запросу, набранному для другого.
 */
const activeSearchQuery = computed<string>(() =>
    activeSection.value === 'users' ? usersSearchQuery.value : searchQuery.value
);

// #endregion

// #region Methods
/**
 * Открывает модалку создания страницы (кнопка шапки и CTA пустого списка).
 */
function handleCreatePage(): void {
    isCreatePageModalOpen.value = true;
}

/**
 * Закрывает модалку создания страницы.
 */
function handleCloseCreatePageModal(): void {
    isCreatePageModalOpen.value = false;
}

/**
 * После создания страницы переходит в редактор билдера.
 *
 * @param address - Адрес созданной страницы.
 */
async function handlePageCreated(address: IBricksPageAddress): Promise<void> {
    isCreatePageModalOpen.value = false;
    await router.push(getBuilderPageRouteLocation(address));
}

/**
 * Переключает активный раздел рейла.
 *
 * Раздел, которого нет в этой установке, не открывается даже по прямому вызову:
 * пункт рейла при выключенном разделе не рисуется, но состояние `unavailable`
 * может прийти уже после того, как человек в разделе оказался.
 *
 * @param section - Ключ раздела.
 */
function handleSelectSection(section: TPublishDashboardSection): void {
    if (section === 'users' && !isUsersSectionVisible.value) {
        return;
    }

    activeSection.value = section;
}

/**
 * Пишет запрос поиска в тот раздел, который открыт.
 *
 * @param value - Введённый запрос.
 */
function handleSearchInput(value: string): void {
    if (activeSection.value === 'users') {
        usersSearchQuery.value = value;
        return;
    }

    searchQuery.value = value;
}

/**
 * Открывает форму создания учётки (кнопка шапки и CTA пустого списка).
 */
function handleCreateUser(): void {
    isCreateUserModalOpen.value = true;
}

/**
 * Закрывает форму создания учётки.
 */
function handleCloseCreateUserModal(): void {
    isCreateUserModalOpen.value = false;
}

/**
 * Открывает свой профиль на вкладке пароля — ключ в своей строке раздела
 * учёток. Админская ручка чужого пароля на своей учётке отказывает намеренно:
 * свой пароль меняется только с вводом текущего.
 */
function handleChangeOwnPassword(): void {
    profileModal.open('password');
}

/**
 * Выбирает страницу — открывает панель деталей.
 *
 * @param page - Страница.
 */
function handleSelectPage(page: TPublishedPageSummary): void {
    selectedPageId.value = String(page.id);
}

/**
 * Закрывает панель деталей.
 */
function handleCloseDetails(): void {
    selectedPageId.value = null;
}

// Смена выбранной страницы (в том числе её закрытие и удаление) гасит начатый
// импорт: его подтверждение и резолвер лежат в body, вне панели деталей, поэтому
// сами по себе не закрываются — а подтверждение, данное для прежней страницы,
// относилось к её содержимому
watch(selectedPageId, () => {
    schemaImport.cancelImport();
});

// Раздел учёток мог исчезнуть под руками: 403 или 404 на его ручках означают,
// что в этой установке его нет, — оставшийся открытым, он показывал бы пустой
// экран без объяснения
watch(isUsersSectionVisible, (isVisible) => {
    if (!isVisible && activeSection.value === 'users') {
        activeSection.value = 'pages';
    }
});

/**
 * Открывает страницу в редакторе билдера.
 *
 * @param page - Страница.
 */
async function handleEditPage(page: TPublishedPageSummary): Promise<void> {
    await router.push(getBuilderPageRouteLocation(toPageAddress(page.pagename, page.urlPrefix)));
}

/**
 * Показывает тост из панели деталей (сохранение, копирование URL).
 *
 * @param message - Текст уведомления.
 * @param variant - Тип уведомления.
 */
function handleDetailsNotify(message: string, variant: 'success' | 'error'): void {
    showToast(message, variant);
}

/**
 * Выходит из database-auth сессии; при ошибке показывает тост.
 */
async function handleLogout(): Promise<void> {
    try {
        await logout();
    } catch {
        showToast(t('bricks.auth.logoutFailed'), 'error');
    }
}

/**
 * Открывает модалку документации.
 */
function handleOpenDocs(): void {
    isDocumentationModalOpen.value = true;
}

/**
 * Закрывает модалку документации.
 */
function handleCloseDocs(): void {
    isDocumentationModalOpen.value = false;
}

/**
 * Передаёт выбранное в галерее изображение в форму панели деталей.
 *
 * Проверка роли обязательна: галерея, открытая пунктом рейла, ничего никуда не
 * возвращает — иначе просмотр файлов подставлял бы картинку в SEO-поля открытой
 * страницы.
 *
 * @param item - Выбранный медиа-объект.
 */
function handleMediaSelect(item: IMediaItem): void {
    if (mediaGallery.context.value !== 'properties') {
        return;
    }

    detailsPanelRef.value?.handleMediaSelect(item);
    mediaGallery.close();
}

/**
 * Показывает тост об ошибке медиа-галереи.
 *
 * @param message - Текст ошибки.
 */
function handleMediaError(message: string): void {
    showToast(message, 'error');
}
// #endregion

// #region Lifecycle
useHead({
    title: computed(() => t('bricks.publish.dashboard.title')),
    bodyAttrs: {
        class: bodyClass,
    },
});

// Загрузка данных — последними операторами setup: `await` делает компонент
// асинхронным, поэтому всё, что зависит от Nuxt-контекста (`useCookie`,
// `useHead`), объявлено выше. На сервере ожидание обязательно: без него
// разметка первого кадра уедет пользователю с пустым списком — ровно то, что
// раньше делала загрузка из `onMounted`.
//
// Список страниц СТАРТУЕТ здесь, а ждём его ниже: он не зависит ни от профиля,
// ни от роли, и последовательное ожидание сложило бы задержки трёх запросов в
// одну задержку HTML
const pagesDataPromise = usePublishPagesData({
    onLoadFailed: () => showToast(t('bricks.publish.dashboard.toasts.loadFailed'), 'error'),
});

// Профиль и роль сессии — до первого кадра: список страниц рисует действия по
// правам, и показать их «пока не выяснили» значило бы отобрать у наблюдателя
// кнопки уже после того, как он их увидел; аватар в углу без профиля рисовать
// нечем. На SSR оба приходят из контекста запроса, ручка `me` нужна только
// сборкам без SSR — и уходит она ОДНА на два состояния: роль `ensureRole` берёт
// из уже полученного профиля, а не запрашивает вторым разом
await ensureProfile();
await ensureRole(() => Promise.resolve(profile.value?.role ?? null));

// Учётки читаются ПОСЛЕ роли: до `ensureRole` сборка без SSR считает роль самой
// узкой, и запрос ушёл бы от наблюдателя за заведомым отказом. Право на раздел
// проверяет сам `ensureUsers` — гард живёт рядом с запросом, а не здесь. Отказ
// загрузки наружу не выходит: он остаётся состоянием раздела, поэтому дашборд
// приезжает даже с недоступными учётками
const [{ isLoadingPages }] = await Promise.all([pagesDataPromise, ensureUsers()]);
// #endregion
</script>

<template>
    <div :class="[$style.BuilderIndex, 'bricks-text']">
        <TheBuilderPublishDashboard
            :active-section="activeSection"
            :search-query="activeSearchQuery"
            :pages-count="pagesCount"
            :users-count="usersCount"
            :is-users-section-visible="isUsersSectionVisible"
            :is-dark-mode="isDarkMode"
            @update:search-query="handleSearchInput"
            @select-section="handleSelectSection"
            @create-page="handleCreatePage"
            @create-user="handleCreateUser"
            @open-media="mediaGallery.openAsManager"
            @open-docs="handleOpenDocs"
            @toggle-dark-mode="toggleDarkMode"
            @toggle-locale="toggleLocale"
            @open-profile="profileModal.open()"
            @logout="handleLogout"
        >
            <!--
                Полоса дефолтного пароля рисуется сама и только когда он
                дефолтный: условие живёт внутри компонента, вместе с флагом
                сессии, который он читает.
            -->
            <template #notice>
                <BuilderAuthDefaultPasswordNotice
                    :can-change-password="canChangePassword"
                    @change-password="handleChangeOwnPassword"
                />
            </template>

            <template #list>
                <BuilderPublishPagesList
                    :pages="filteredPages"
                    :active-filter="activeFilter"
                    :counts="filterCounts"
                    :is-loading="isLoadingPages"
                    :has-any-pages="hasAnyPages"
                    :duplicating-page-id="duplicatingPageId"
                    :selected-page-id="selectedPageId"
                    @update:active-filter="activeFilter = $event"
                    @create-page="handleCreatePage"
                    @select="handleSelectPage"
                    @preview-thumbnail="previewThumbnail"
                    @edit="handleEditPage"
                    @preview="previewPage"
                    @duplicate="duplicatePage"
                    @delete="requestDeletePage"
                />
            </template>

            <!--
                Раздел учёток — компонент-контроллер: у него своё состояние и свои
                четыре окна, и собранный здесь он добавил бы в этот файл вторую
                машину состояний рядом со страницами
            -->
            <template v-if="isUsersSectionVisible" #users>
                <TheBuilderUsersSection
                    :search-query="usersSearchQuery"
                    :is-create-modal-open="isCreateUserModalOpen"
                    :current-user-id="currentUserId"
                    @notify="showToast"
                    @close-create-modal="handleCloseCreateUserModal"
                    @create-user="handleCreateUser"
                    @change-own-password="handleChangeOwnPassword"
                />
            </template>

            <template v-if="selectedPage" #details>
                <BuilderPublishDetailsPanel
                    ref="detailsPanelRef"
                    :page="selectedPage"
                    :is-duplicating="duplicatingPageId === String(selectedPage.id)"
                    :is-importing="schemaImport.isImporting.value"
                    @close="handleCloseDetails"
                    @edit="handleEditPage"
                    @duplicate="duplicatePage"
                    @delete="requestDeletePage"
                    @toggle-published="togglePublished"
                    @open-media="mediaGallery.openAsPicker"
                    @restore-version="requestRestoreVersion"
                    @import-schema-file="schemaImport.requestPageImport"
                    @notify="handleDetailsNotify"
                />
            </template>
        </TheBuilderPublishDashboard>

        <TheBuilderPublishCreatePageModal
            :is-open="isCreatePageModalOpen"
            :resolve-imported-schema="schemaImport.resolveSchemaForCreate"
            @close="handleCloseCreatePageModal"
            @created="handlePageCreated"
        />

        <TheBuilderAuthProfileModal
            v-if="profileModal.shouldMount.value"
            :is-open="profileModal.isOpen.value"
            :can-change-password="canChangePassword"
            :initial-tab="profileModal.requestedTab.value"
            @close="profileModal.close"
            @notify="showToast"
        />

        <TheBuilderDocumentationModal
            :is-open="isDocumentationModalOpen"
            @close="handleCloseDocs"
        />

        <TheBuilderMediaGalleryModal
            v-if="mediaGallery.shouldMount.value"
            :visible="mediaGallery.isOpen.value"
            :context="mediaGallery.context.value"
            @close="mediaGallery.close"
            @select="handleMediaSelect"
            @error="handleMediaError"
        />

        <BricksConfirmModal
            :is-open="isDeleteConfirmationOpen"
            :title="t('bricks.publish.dashboard.deleteConfirm.title')"
            :description="deleteConfirmationDescription"
            :confirm-text="t('bricks.common.delete')"
            confirm-variant="danger"
            :is-loading="isDeleting"
            @close="closeDeleteConfirmation()"
            @confirm="confirmDeletePage"
        />

        <BricksConfirmModal
            :is-open="isRestoreConfirmationOpen"
            :title="t('bricks.publish.dashboard.details.versions.restoreConfirm.title')"
            :description="restoreConfirmationDescription"
            :confirm-text="t('bricks.publish.dashboard.details.versions.restore')"
            confirm-variant="primary"
            :is-loading="isRestoring"
            @close="closeRestoreConfirmation()"
            @confirm="confirmRestoreVersion"
        />

        <!--
            Подтверждение замены содержимого. Резолвер картинок запускается не по
            confirm, а по уходу диалога из DOM: `force-mount` держит уезжающее
            подтверждение до конца анимации, и открытая синхронно модалка
            резолвера встала бы под ним (z-index подтверждения выше) со вторым
            focus trap
        -->
        <BricksConfirmModal
            :is-open="schemaImport.isReplaceConfirmationOpen.value"
            :title="t('bricks.publish.dashboard.details.schema.replaceConfirm.title')"
            :description="schemaImport.replaceConfirmationDescription.value"
            :confirm-text="t('bricks.publish.dashboard.details.schema.replaceConfirm.confirm')"
            confirm-variant="primary"
            @close="schemaImport.closeReplaceConfirmation"
            @confirm="schemaImport.confirmReplace"
            @after-leave="schemaImport.handleConfirmationAfterLeave"
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

        <BuilderMediaGalleryPreviewLightbox
            :item="thumbnailPreviewItem"
            @close="closeThumbnailPreview"
        />

        <BricksToast
            v-model:visible="toast.visible"
            :message="toast.message"
            :variant="toast.variant"
            :duration="toastDuration"
        />
    </div>
</template>

<style module lang="scss">
.BuilderIndex {
    min-height: 100vh;
    background-color: var(--bricks-base-50);
}
</style>
