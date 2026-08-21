<script setup lang="ts">
// #region Imports
// Types
import type { TPublishedPageSummary } from '../../../common/types/bricks-api';
import type { IMediaCategory, IMediaItem } from '../../../common/types/media';
import type { TPublishDashboardSection } from '../types/dashboard';
import type { TBricksTemplateSummary } from '../../../common/types/templates';
import type { TMediaLightboxItem } from '../../media/types/media';
import type { IBricksPageAddress } from '../../../common/types/pageAddress';

// Utils
import { ALL_MEDIA_CATEGORIES_FILTER } from '../../../common/constants/mediaCategories';
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
import { useMediaCategoriesStore } from '../../media/stores/mediaCategories';
import { usePublishStore } from '../stores/publish';

// Composables
import { useAuthProfile } from '../../auth/composables/useAuthProfile';
import { useAuthProfileModal } from '../../auth/composables/useAuthProfileModal';
import { useAuthSession } from '../../auth/composables/useAuthSession';
import { useBuilderPermissions } from '../../core/composables/useBuilderPermissions';
import { useBuilderToast } from '../../core/composables/useBuilderToast';
import { usePublishDashboard } from '../composables/usePublishDashboard';
import { usePublishDashboardPreferences } from '../composables/usePublishDashboardPreferences';
import { usePublishDashboardSections } from '../composables/usePublishDashboardSections';
import { usePublishMediaGallery } from '../composables/usePublishMediaGallery';
import { usePublishMediaSurface } from '../composables/usePublishMediaSurface';
import { usePublishPageActions } from '../composables/usePublishPageActions';
import { usePublishPageDelete } from '../composables/usePublishPageDelete';
import { usePublishPagesData } from '../composables/usePublishPagesData';
import { usePublishVersionRestore } from '../composables/usePublishVersionRestore';
import { usePublishSchemaImport } from '../composables/usePublishSchemaImport';
import { usePublishTemplatesSurface } from '../composables/usePublishTemplatesSurface';
import { useTemplatesData } from '../../templates/composables/useTemplatesData';
import { useUsersData } from '../../users/composables/useUsersData';

// Components
import TheBuilderPublishDashboard from '../components/TheBuilderPublishDashboard.vue';
import BuilderPublishPagesList from '../components/BuilderPublishPagesList.vue';
import BuilderPublishDetailsPanel from '../components/BuilderPublishDetailsPanel.vue';
import TheBuilderPublishCreatePageModal from '../components/TheBuilderPublishCreatePageModal.vue';
import BuilderMediaGalleryPreviewLightbox from '../../media/components/BuilderMediaGalleryPreviewLightbox.vue';
import BuilderMediaGalleryUploadControls from '../../media/components/BuilderMediaGalleryUploadControls.vue';
import BuilderMediaSectionDetailsPanel from '../../media/components/BuilderMediaSectionDetailsPanel.vue';
import TheBuilderMediaSection from '../../media/components/TheBuilderMediaSection.vue';
import TheBuilderUsersSection from '../../users/components/TheBuilderUsersSection.vue';
import TheBuilderTemplatesSection from '../../templates/components/TheBuilderTemplatesSection.vue';
import TheBuilderTemplatesSaveModal from '../../templates/components/TheBuilderTemplatesSaveModal.vue';
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
// Ряд категорий читает раздел, а показывает ещё и панель деталей — источник
// один, стор
const mediaCategoriesStore = useMediaCategoriesStore();
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
// Поверхность медиатеки: загрузка живёт в шапке дашборда, а выбранный файл — в
// панели деталей, то есть по разные стороны от самого раздела. Общее состояние
// держит хост — ровно как выбранную страницу
const media = usePublishMediaSurface({ onNotify: showToast });
const uploadControlsRef = ref<InstanceType<typeof BuilderMediaGalleryUploadControls> | null>(null);
// Список учёток нужен дашборду и до открытия раздела: пункт рейла показывает
// счётчик. Сам раздел читает то же состояние — оно одно на приложение
const { usersCount, status: usersStatus, ensureUsers } = useUsersData();
// То же со шаблонами: счётчик рейла рисуется до открытия раздела, а список один
// на приложение — его же читают раздел и выбор источника новой страницы
const { templatesCount, ensureTemplates } = useTemplatesData();
// Поверхность шаблонов: подготовка источника из строки списка (схему страницы
// приходится читать point-lookup'ом), предвыбор шаблона формы создания и снимок
// для лайтбокса
const templates = usePublishTemplatesSurface({ onNotify: showToast });
const isCreatePageModalOpen = ref(false);
const isCreateUserModalOpen = ref(false);
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
const mediaCategories = computed<IMediaCategory[]>(() => mediaCategoriesStore.categories);
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

/**
 * Открытый раздел и строка поиска этого раздела: у каждого списка запрос свой,
 * а поле в шапке одно. Ниже Computed, а не в Data: композабл гасит открытый
 * раздел учёток, когда тот пропадает, — то есть читает доступность раздела,
 * которая складывается прямо над ним.
 */
const {
    activeSection,
    usersSearchQuery,
    templatesSearchQuery,
    mediaSearchQuery,
    activeSearchQuery,
    selectSection,
    setSearchQuery,
} = usePublishDashboardSections({
    pagesSearchQuery: searchQuery,
    isUsersSectionVisible,
    onLeaveMedia: media.resetSurface,
    onEnterMedia: media.ensureMedia,
});

/** Своя учётка: её строка в списке помечается и теряет часть действий. */
const currentUserId = computed<number | null>(() => profile.value?.id ?? null);

/**
 * Что показывает лайтбокс: снимок страницы, снимок шаблона либо файл медиатеки.
 * Один компонент на все разделы — открыт всегда ровно один из них, и второй
 * экземпляр лайтбокса добавил бы в разметку вторую копию диалога с focus trap.
 */
const lightboxItem = computed<TMediaLightboxItem | null>(
    () => media.previewItem.value ?? templates.previewItem.value ?? thumbnailPreviewItem.value
);

// #endregion

// #region Methods
/**
 * Открывает модалку создания страницы (кнопка шапки и CTA пустого списка).
 */
function handleCreatePage(): void {
    templates.clearCreateSelection();
    isCreatePageModalOpen.value = true;
}

/**
 * Открывает форму создания страницы с выбранным шаблоном-источником.
 *
 * Форма та же, что у кнопки шапки: у страницы из шаблона тот же адрес, те же SEO
 * поля и та же проверка занятости — отдельная форма повторяла бы всё это ради
 * одного предвыбранного источника.
 *
 * @param template - Шаблон-источник.
 */
function handleCreatePageFromTemplate(template: TBricksTemplateSummary): void {
    templates.selectForCreate(template);
    isCreatePageModalOpen.value = true;
}

/**
 * Закрывает лайтбокс: гасятся оба источника снимка — какой из них был открыт,
 * компоненту неизвестно, а лишний сброс ничего не стоит.
 */
function handleCloseLightbox(): void {
    media.closePreview();
    templates.closePreview();
    closeThumbnailPreview();
}

/**
 * Шаблон сохранён: закрываем форму и сообщаем.
 *
 * @param template - Сохранённый шаблон.
 */
function handleTemplateSaved(template: TBricksTemplateSummary): void {
    templates.close();
    showToast(t('bricks.templates.toasts.saved', { name: template.name }), 'success');
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
 * Проверять контекст больше нечего: модалка на дашборде осталась только пикером
 * OG-изображения — менеджером файлов работает раздел рейла, а он ничего никуда
 * не возвращает.
 *
 * @param item - Выбранный медиа-объект.
 */
function handleMediaSelect(item: IMediaItem): void {
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

/**
 * Открывает системный выбор файлов из плитки-приёмника: сам input живёт в
 * контролах шапки, второй такой же в сетке означал бы две точки правды о том,
 * какие типы файлов принимаются.
 */
function handleMediaUploadRequest(): void {
    uploadControlsRef.value?.openFilePicker();
}

/**
 * Открывает выбранный файл во весь экран (действие панели деталей).
 */
function handleMediaPreviewSelected(): void {
    const item = media.selectedItem.value;

    if (!item) {
        return;
    }

    media.openPreview(item);
}

/**
 * Пустой результат в медиатеке: снимаются разом категория и строка поиска —
 * владельцы у них разные (поверхность и шапка).
 */
function handleResetMediaFilters(): void {
    media.categoryFilter.value = ALL_MEDIA_CATEGORIES_FILTER;
    mediaSearchQuery.value = '';
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
// Шаблоны читаются в той же группе, что и учётки: их счётчик тоже рисуется в
// первом кадре рейла, а отказ загрузки остаётся состоянием раздела и дашборд не
// уносит. Права на чтение шаблонов есть у любой роли, поэтому ждать `ensureRole`
// им не нужно — но и отдельной очереди они не заводят
// Список файлов читается в той же группе: счётчик медиатеки рисуется в первом
// кадре рейла, а сам раздел получает готовые данные и своего ожидания не
// заводит. Отказ остаётся тостом и дашборд не уносит
const [{ isLoadingPages }] = await Promise.all([
    pagesDataPromise,
    ensureUsers(),
    ensureTemplates(),
    media.ensureMedia(),
]);
// #endregion
</script>

<template>
    <div :class="[$style.BuilderIndex, 'bricks-text']">
        <TheBuilderPublishDashboard
            :active-section="activeSection"
            :search-query="activeSearchQuery"
            :pages-count="pagesCount"
            :templates-count="templatesCount"
            :users-count="usersCount"
            :media-count="media.mediaCount.value"
            :is-users-section-visible="isUsersSectionVisible"
            :is-dark-mode="isDarkMode"
            @update:search-query="setSearchQuery"
            @select-section="selectSection"
            @create-page="handleCreatePage"
            @create-user="handleCreateUser"
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
            <!--
                Первичное действие медиатеки: кнопка загрузки, скрытый input и
                поповер параметров. Оболочка их не рисует сама — за ними тянется
                весь домен медиа; она лишь решает, показывать ли слот
            -->
            <template #headerAction>
                <BuilderMediaGalleryUploadControls
                    ref="uploadControlsRef"
                    :max-image-size-mb="media.maxImageSizeMb"
                    :max-video-size-mb="media.maxVideoSizeMb"
                    :optimization="media.uploadOptimization.value"
                    :configured-max-width="media.defaultOptimization.maxWidth"
                    :upload-progress="media.uploadProgress.value"
                    :show-options="false"
                    :drop-hint="t('bricks.media.dropSectionHint')"
                    @upload="media.uploadFiles"
                />
            </template>

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
                    :template-source-page-id="templates.preparingPageId.value"
                    :selected-page-id="selectedPageId"
                    @update:active-filter="activeFilter = $event"
                    @create-page="handleCreatePage"
                    @select="handleSelectPage"
                    @preview-thumbnail="previewThumbnail"
                    @edit="handleEditPage"
                    @preview="previewPage"
                    @duplicate="duplicatePage"
                    @save-as-template="templates.requestFromPage"
                    @delete="requestDeletePage"
                />
            </template>

            <!--
                Раздел шаблонов — тоже компонент-контроллер: своё состояние, свои
                окна, а хост остаётся тем, кто показывает тосты, открывает форму
                создания страницы и лайтбокс
            -->
            <template #templates>
                <TheBuilderTemplatesSection
                    :search-query="templatesSearchQuery"
                    @notify="showToast"
                    @go-to-pages="selectSection('pages')"
                    @create-page="handleCreatePageFromTemplate"
                    @preview-thumbnail="templates.previewThumbnail"
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

            <!--
                Раздел медиатеки: дорожка категорий, сетка и приёмник. Загрузка и
                выбранный файл им не владеют — они по разные стороны от раздела
                (шапка дашборда и панель деталей), поэтому приходят пропами
            -->
            <template #media>
                <TheBuilderMediaSection
                    :search-query="mediaSearchQuery"
                    :category-filter="media.categoryFilter.value"
                    :selected-item-id="media.selectedItemId.value"
                    :max-image-size-mb="media.maxImageSizeMb"
                    :max-video-size-mb="media.maxVideoSizeMb"
                    :upload-optimization="media.uploadOptimization.value"
                    :configured-max-width="media.defaultOptimization.maxWidth"
                    @update:category-filter="media.categoryFilter.value = $event"
                    @update:upload-optimization="media.setOptimization"
                    @select="media.selectItem"
                    @preview="media.openPreview"
                    @upload="media.uploadFiles"
                    @request-upload="handleMediaUploadRequest"
                    @reset-filters="handleResetMediaFilters"
                    @notify="showToast"
                />
            </template>

            <template v-if="media.selectedItem.value" #mediaDetails>
                <BuilderMediaSectionDetailsPanel
                    :item="media.selectedItem.value"
                    :categories="mediaCategories"
                    @close="media.closeDetails"
                    @update-meta="media.updateMeta"
                    @update-category="media.updateCategory"
                    @remove="media.requestDelete"
                    @preview="handleMediaPreviewSelected"
                    @notify="showToast"
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
                    @open-media="mediaGallery.open"
                    @restore-version="requestRestoreVersion"
                    @import-schema-file="schemaImport.requestPageImport"
                    @notify="handleDetailsNotify"
                />
            </template>
        </TheBuilderPublishDashboard>

        <TheBuilderPublishCreatePageModal
            :is-open="isCreatePageModalOpen"
            :initial-template="templates.createTemplate.value"
            :resolve-imported-schema="schemaImport.resolveSchemaForCreate"
            @close="handleCloseCreatePageModal"
            @created="handlePageCreated"
        />

        <!--
            Форма шаблона одна на дашборд: её открывает действие строки списка
            страниц, а содержимое приносит `usePublishTemplateSave`
        -->
        <TheBuilderTemplatesSaveModal
            :is-open="templates.isModalOpen.value"
            :source="templates.source.value"
            @close="templates.close"
            @saved="handleTemplateSaved"
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

        <!--
            Модалка галереи осталась одним — пикером OG-изображения панели
            деталей страницы. Менеджером файлов работает раздел рейла
        -->
        <TheBuilderMediaGalleryModal
            v-if="mediaGallery.shouldMount.value"
            :visible="mediaGallery.isOpen.value"
            context="properties"
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

        <!--
            Подтверждение удаления файла — здесь, а не в разделе: удаление
            запрашивает панель деталей, которая живёт в слоте оболочки, и её
            состоянием владеет тот же хост
        -->
        <BricksConfirmModal
            :is-open="media.isDeleteConfirmOpen.value"
            :title="t('bricks.media.deleteImageTitle')"
            :description="t('bricks.media.deleteImageDescription')"
            :confirm-text="t('bricks.common.delete')"
            confirm-variant="danger"
            :is-loading="media.isDeleting.value"
            @close="media.closeDeleteConfirm"
            @confirm="media.confirmDelete"
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

        <BuilderMediaGalleryPreviewLightbox :item="lightboxItem" @close="handleCloseLightbox" />

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
