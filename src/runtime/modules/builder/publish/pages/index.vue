<script setup lang="ts">
// #region Imports
// Types
import type { TPublishedPageSummary } from '../../../common/types/bricks-api';
import type { IMediaItem } from '../../../common/types/media';
import type { TMediaLightboxItem } from '../../media/types/media';
import type { TPublishDashboardSection } from '../types/dashboard';
import type { IBricksPageAddress } from '../../../common/types/pageAddress';

// Utils
import { isRequestTimeoutError } from '../../../common/utils/apiRequestPolicy';
import {
    getBuilderPageRouteLocation,
    toPageAddress,
} from '../../../common/utils/bricks/pageAddress';
import { getPublishedPagePath } from '../../../common/utils/bricks/routePaths';

// Vue
import { computed, defineAsyncComponent, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';

// Nuxt
import { useRouter, useCookie, useHead } from '#imports';

// Pinia
import { usePublishStore } from '../stores/publish';

// Composables
import { useAuthSession } from '../../auth/composables/useAuthSession';
import { useBuilderToast } from '../../core/composables/useBuilderToast';
import { usePublishDashboard } from '../composables/usePublishDashboard';
import { usePublishPagesData } from '../composables/usePublishPagesData';
import { usePublishPreview } from '../composables/usePublishPreview';
import { usePublishVersionRestore } from '../composables/usePublishVersionRestore';
import { usePublishSchemaImport } from '../composables/usePublishSchemaImport';

// Components
import TheBuilderPublishDashboard from '../components/TheBuilderPublishDashboard.vue';
import BuilderPublishPagesList from '../components/BuilderPublishPagesList.vue';
import BuilderPublishDetailsPanel from '../components/BuilderPublishDetailsPanel.vue';
import TheBuilderPublishCreatePageModal from '../components/TheBuilderPublishCreatePageModal.vue';
import BuilderMediaGalleryPreviewLightbox from '../../media/components/BuilderMediaGalleryPreviewLightbox.vue';
import BricksConfirmModal from '../../../ui/feedback/BricksConfirmModal.vue';
import BricksToast from '../../../ui/feedback/BricksToast.vue';

// Модалки — lazy-чанки: не нужны до открытия (документация тянет markdown-it и статьи)
const TheBuilderDocumentationModal = defineAsyncComponent(
    () => import('../../documentation/components/TheBuilderDocumentationModal.vue')
);
const TheBuilderMediaGalleryModal = defineAsyncComponent(
    () => import('../../media/components/TheBuilderMediaGalleryModal.vue')
);
// Резолвер картинок нужен только импорту схемы — держим его в отдельном чанке.
// Условие монтирования в шаблоне обязательно: без него чанк уехал бы к первому
// рендеру дашборда, и ленивым импорт был бы только на бумаге
const TheBuilderMediaImageResolverModal = defineAsyncComponent(
    () => import('../../media/components/TheBuilderMediaImageResolverModal.vue')
);
// #endregion

// #region Data
const { t, locale, setLocale } = useI18n();
const router = useRouter();
const publishStore = usePublishStore();
const { toast, showToast } = useBuilderToast();
const { generatePreviewUrl } = usePublishPreview();
const { isDatabaseMode, logout } = useAuthSession();
const { searchQuery, activeFilter, filterCounts, filteredPages, hasAnyPages } = usePublishDashboard(
    computed(() => publishStore.publishedPages)
);

const activeSection = ref<TPublishDashboardSection>('pages');
const isCreatePageModalOpen = ref(false);
const isDocumentationModalOpen = ref(false);
const isMediaGalleryModalOpen = ref(false);
const mediaGalleryContext = ref<'manager' | 'properties'>('manager');
const duplicatingPageId = ref<string | null>(null);
const pendingDeletePage = ref<TPublishedPageSummary | null>(null);
const isDeleteConfirmationOpen = ref(false);
const isDeleting = ref(false);

const {
    isRestoreConfirmationOpen,
    isRestoring,
    restoreConfirmationDescription,
    requestRestoreVersion,
    closeRestoreConfirmation,
    confirmRestoreVersion,
} = usePublishVersionRestore({ onNotify: showToast });
const selectedPageId = ref<string | null>(null);
const thumbnailPreviewItem = ref<TMediaLightboxItem | null>(null);
const detailsPanelRef = ref<InstanceType<typeof BuilderPublishDetailsPanel> | null>(null);

// Импорт схемы: подтверждение замены, резолвинг картинок и запись. Живёт здесь,
// а не в панели деталей, потому что обслуживает и модалку создания, и потому что
// его модалки телепортированы в body — то есть переживают и смену выбранной
// страницы, и закрытие панели. Не разбирается по именам: полями пользуется
// только шаблон, а россыпь из семнадцати переменных читается хуже
const schemaImport = usePublishSchemaImport({
    onNotify: showToast,
    isTargetSelected: (pageId) => selectedPageId.value === String(pageId),
});

const darkModeCookie = useCookie<boolean>('bricks-dark-mode', {
    default: () => false,
    maxAge: 60 * 60 * 24 * 365,
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

const deleteConfirmationDescription = computed<string>(() => {
    const page = pendingDeletePage.value;
    if (!page) {
        return t('bricks.publish.dashboard.deleteConfirm.generic');
    }

    return t('bricks.publish.dashboard.deleteConfirm.named', {
        title: page.title,
        // Полный адрес: у одноимённых страниц под разными префиксами путь по
        // одному имени совпадал бы, и при равных заголовках пользователь не
        // понимал бы, какую из них удаляет
        path: getPublishedPagePath(toPageAddress(page.pagename, page.urlPrefix)),
    });
});

const isDarkMode = computed<boolean>(() => darkModeCookie.value ?? false);

/**
 * Класс body формируется реактивно — включает bricks-dark при активной тёмной теме.
 * Работает на SSR: cookie читается на сервере, класс рендерится сразу.
 */
const bodyClass = computed(() =>
    darkModeCookie.value ? 'bricks-page bricks-dark' : 'bricks-page'
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
 * @param section - Ключ раздела.
 */
function handleSelectSection(section: TPublishDashboardSection): void {
    activeSection.value = section;
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

/**
 * Открывает страницу в редакторе билдера.
 *
 * @param page - Страница.
 */
async function handleEditPage(page: TPublishedPageSummary): Promise<void> {
    await router.push(getBuilderPageRouteLocation(toPageAddress(page.pagename, page.urlPrefix)));
}

/**
 * Оптимистично переключает статус публикации; при ошибке откатывает.
 *
 * @param page - Страница.
 * @param published - Новый флаг публикации.
 */
async function handleTogglePublished(
    page: TPublishedPageSummary,
    published: boolean
): Promise<void> {
    const target = publishStore.getPageById(page.id);
    if (!target || target.published === published) {
        return;
    }

    const previousPublished = target.published;
    target.published = published;

    try {
        await publishStore.patchPage(page.id, { published });
    } catch (error: unknown) {
        const current = publishStore.getPageById(page.id);
        if (current) {
            current.published = previousPublished;
        }
        const message =
            error instanceof Error
                ? error.message
                : t('bricks.publish.dashboard.details.toasts.statusFailed');
        showToast(message, 'error');
    }
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
 * Открывает превью страницы в новой вкладке.
 *
 * @param page - Страница.
 */
function handlePreviewPage(page: TPublishedPageSummary): void {
    window.open(generatePreviewUrl(toPageAddress(page.pagename, page.urlPrefix)), '_blank');
}

/**
 * Открывает миниатюру страницы в лайтбоксе медиа-галереи.
 *
 * @param page - Страница с thumbnailUrl.
 */
function handlePreviewThumbnail(page: TPublishedPageSummary): void {
    if (!page.thumbnailUrl) {
        return;
    }

    thumbnailPreviewItem.value = {
        url: page.thumbnailUrl,
        mimeType: 'image/webp',
        alt: page.title || page.pagename,
        filename: `${page.pagename}.webp`,
    };
}

/**
 * Закрывает лайтбокс миниатюры.
 */
function handleCloseThumbnailPreview(): void {
    thumbnailPreviewItem.value = null;
}

/**
 * Дублирует страницу: копия создаётся черновиком с уникальным pagename.
 *
 * @param page - Исходная страница.
 */
async function handleDuplicatePage(page: TPublishedPageSummary): Promise<void> {
    if (duplicatingPageId.value !== null) {
        return;
    }

    duplicatingPageId.value = String(page.id);
    try {
        await publishStore.duplicatePage(page.id);
        showToast(t('bricks.publish.dashboard.toasts.duplicated'), 'success');
    } catch (error: unknown) {
        const message =
            error instanceof Error
                ? error.message
                : t('bricks.publish.dashboard.toasts.duplicateFailed');
        showToast(message, 'error');
    } finally {
        duplicatingPageId.value = null;
    }
}

/**
 * Запрашивает подтверждение удаления страницы.
 *
 * @param page - Страница.
 */
function handleDeletePage(page: TPublishedPageSummary): void {
    pendingDeletePage.value = page;
    isDeleteConfirmationOpen.value = true;
}

/**
 * Закрывает подтверждение удаления.
 *
 * @param force - Закрыть даже во время выполнения удаления.
 */
function handleCloseDeleteConfirmation(force = false): void {
    if (!force && isDeleting.value) {
        return;
    }

    isDeleteConfirmationOpen.value = false;
    pendingDeletePage.value = null;
}

/**
 * Подтверждает и выполняет удаление страницы (файл превью в хранилище
 * best-effort чистит сервер в DELETE /api/bricks/:id).
 *
 * Определённый отказ сервера оставляет подтверждение открытым — страница на
 * месте, и повтор под рукой. Обрыв по потолку ожидания его закрывает: исход
 * неизвестен, страница могла быть удалена, и сообщение об этом прямо просит
 * сначала обновить данные (список стор перечитывает сам), а не повторять.
 */
async function handleConfirmDelete(): Promise<void> {
    const page = pendingDeletePage.value;
    if (!page) {
        return;
    }

    isDeleting.value = true;
    try {
        await publishStore.deletePage(page.id);
        if (selectedPageId.value === String(page.id)) {
            selectedPageId.value = null;
        }
        handleCloseDeleteConfirmation(true);
    } catch (error: unknown) {
        const message =
            error instanceof Error
                ? error.message
                : t('bricks.publish.dashboard.toasts.deleteFailed');
        showToast(message, 'error');

        if (isRequestTimeoutError(error)) {
            handleCloseDeleteConfirmation(true);
        }
    } finally {
        isDeleting.value = false;
    }
}

/**
 * Переключает тёмную/светлую тему дашборда и сохраняет выбор в cookie
 * (общий с редактором билдера cookie `bricks-dark-mode`).
 */
function handleToggleDarkMode(): void {
    darkModeCookie.value = !darkModeCookie.value;
}

/**
 * Переключает локаль интерфейса (ru ⇄ en); cookie `bricks-locale` пишет сам i18n.
 */
async function handleToggleLocale(): Promise<void> {
    await setLocale(locale.value === 'ru' ? 'en' : 'ru');
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
 * Открывает медиа-галерею в режиме менеджера (пункт рейла).
 */
function handleOpenMediaGallery(): void {
    mediaGalleryContext.value = 'manager';
    isMediaGalleryModalOpen.value = true;
}

/**
 * Открывает медиа-галерею как пикер OG-изображения панели деталей.
 */
function handleOpenMediaFromDetails(): void {
    mediaGalleryContext.value = 'properties';
    isMediaGalleryModalOpen.value = true;
}

/**
 * Закрывает медиа-галерею.
 */
function handleCloseMediaGallery(): void {
    isMediaGalleryModalOpen.value = false;
}

/**
 * Передаёт выбранное в галерее изображение в форму панели деталей.
 *
 * @param item - Выбранный медиа-объект.
 */
function handleMediaSelect(item: IMediaItem): void {
    if (mediaGalleryContext.value !== 'properties') {
        return;
    }
    detailsPanelRef.value?.handleMediaSelect(item);
    isMediaGalleryModalOpen.value = false;
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

// Загрузка списка — последним оператором setup: `await` делает компонент
// асинхронным, поэтому всё, что зависит от Nuxt-контекста (`useCookie`,
// `useHead`), объявлено выше. На сервере ожидание обязательно: без него
// разметка первого кадра уедет пользователю с пустым списком — ровно то, что
// раньше делала загрузка из `onMounted`
const { isLoadingPages } = await usePublishPagesData({
    onLoadFailed: () => showToast(t('bricks.publish.dashboard.toasts.loadFailed'), 'error'),
});
// #endregion
</script>

<template>
    <div :class="[$style.BuilderIndex, 'bricks-text']">
        <TheBuilderPublishDashboard
            :active-section="activeSection"
            :search-query="searchQuery"
            :pages-count="pagesCount"
            :is-dark-mode="isDarkMode"
            :is-logout-visible="isDatabaseMode"
            @update:search-query="searchQuery = $event"
            @select-section="handleSelectSection"
            @create-page="handleCreatePage"
            @open-media="handleOpenMediaGallery"
            @open-docs="handleOpenDocs"
            @toggle-dark-mode="handleToggleDarkMode"
            @toggle-locale="handleToggleLocale"
            @logout="handleLogout"
        >
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
                    @preview-thumbnail="handlePreviewThumbnail"
                    @edit="handleEditPage"
                    @preview="handlePreviewPage"
                    @duplicate="handleDuplicatePage"
                    @delete="handleDeletePage"
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
                    @duplicate="handleDuplicatePage"
                    @delete="handleDeletePage"
                    @toggle-published="handleTogglePublished"
                    @open-media="handleOpenMediaFromDetails"
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

        <TheBuilderDocumentationModal
            :is-open="isDocumentationModalOpen"
            @close="handleCloseDocs"
        />

        <TheBuilderMediaGalleryModal
            :visible="isMediaGalleryModalOpen"
            :context="mediaGalleryContext"
            @close="handleCloseMediaGallery"
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
            @close="handleCloseDeleteConfirmation"
            @confirm="handleConfirmDelete"
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
            @close="handleCloseThumbnailPreview"
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
