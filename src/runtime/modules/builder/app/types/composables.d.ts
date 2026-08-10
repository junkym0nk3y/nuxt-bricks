/**
 * Типы для composables.
 */

import type { IComponentLibraryItem } from '../../../common/types/brick';
import type { ComputedRef, Ref } from 'vue';
import type { useSidebarStore } from '../../core/stores/sidebar';
import type { usePublishStore } from '../../publish/stores/publish';
import type { IMediaItem, TMediaGalleryContext } from '../../../common/types/media';
import type { IPublishedPage, TPublishedPageSummary } from '../../../common/types/bricks-api';
import type { IBricksPageAddress } from '../../../common/types/pageAddress';
import type { IUsePublishSchemaImportReturn } from '../../publish/types/composables';
import type { ISidebarExpose } from './builder';
import type { IBuilderDraftSnapshot } from '../../publish/types/builderDrafts';
import type { IBuilderToastState } from '../../core/types/toast';
import type { TCachedModal } from '../../core/types/modals';
import type { IBrickManifestEntry } from '../../../common/types/brickManifest';
import type { ISkippedBrick } from '../../core/types/componentLibrary';
import type { IDraftStorageNotice } from './draftStorage';

/**
 * Функция показа toast-уведомления билдера.
 */
export type TShowToast = (
    message: string,
    variant?: IBuilderToastState['variant'],
    duration?: number
) => void;

// #region useBuilderSessionAddress / useBuilderSession / useBuilderDraftPersistence
/**
 * Переносит открытую сессию билдера на новый адрес (`urlPrefix + pagename`):
 * миграция черновика localStorage + синхронизация URL через Vue Router.
 */
export type TRenameBuilderSession = (next: IBricksPageAddress) => Promise<void>;

/**
 * Единый переход сессии на сохранённую страницу (Save as Copy): store в edit mode
 * → renameSession (route + sessionAddress + миграция черновика) → фиксация
 * savedSnapshot. Реализация — `useBuilderSession.switchToSavedPage`; toast/thumbnail
 * после resolve — ответственность вызывающего (`useBuilderPage.handleSaveAsCopy`).
 */
export type TSwitchToSavedPage = (page: IPublishedPage) => Promise<void>;

/**
 * Опции composable useBuilderSessionAddress.
 */
export interface IBuilderSessionAddressOptions {
    draftStorageNotice: IDraftStorageNotice;
}

/**
 * Возвращаемое значение composable useBuilderSessionAddress.
 */
export interface IUseBuilderSessionAddressReturn {
    routeAddress: ComputedRef<IBricksPageAddress>;
    sessionAddress: Ref<IBricksPageAddress>;
    renameSession: TRenameBuilderSession;
}

/**
 * Токен сессии билдера: снимается операцией на старте и сверяется перед
 * применением результата и побочных эффектов. Реализация —
 * `useBuilderSessionToken`; инкременты принадлежат только `useBuilderSession`.
 */
export interface IBuilderSessionToken {
    /** Текущее значение — для watch'ей сброса поверхностей, переживающих сессию. */
    token: ComputedRef<number>;
    /** Снимает токен на старте операции. */
    capture: () => number;
    /** Актуальна ли сессия, в которой операция началась. */
    isCurrent: (captured: number) => boolean;
    /** Гасит все начатые операции: новое открытие сессии, dispose экземпляра. */
    invalidate: () => void;
}

/**
 * Фиксирует текущее состояние сессии как сохранённое: новый `savedSnapshot` и
 * удаление черновика по актуальному ключу. Реализация —
 * `useBuilderSession.commitSavedSnapshot`; зовётся явно из обоих путей записи
 * (обычное сохранение и переход на копию). Принимает токен сессии,
 * снятый на старте сохранения, и сверяет его сам — между проверкой у вызывающего
 * и фиксацией стоит `await renameSession`.
 */
export type TCommitSavedSnapshot = (capturedToken: number) => void;

/**
 * Опции composable useBuilderSession.
 */
export interface IBuilderSessionOptions {
    routeAddress: ComputedRef<IBricksPageAddress>;
    sessionAddress: Ref<IBricksPageAddress>;
    showToast: TShowToast;
    renameSession: TRenameBuilderSession;
    sessionToken: IBuilderSessionToken;
    /**
     * Сообщение о недоступном хранилище черновиков. Сессия удаляет черновик в
     * трёх местах (stale-запись, фиксация сохранённого, отказ от восстановления),
     * и тихий отказ удаления вернул бы предложение восстановить уже отклонённое.
     */
    draftStorageNotice: IDraftStorageNotice;
}

/**
 * Опции composable useBuilderDraftPrompt: предложение восстановить черновик
 * живёт поверх открытой сессии, поэтому всё, что связывает его с ней, приходит
 * снаружи — своего состояния сессии у предложения нет.
 */
export interface IBuilderDraftPromptOptions {
    /** Проверка поколения открытия: отсекает ответ по предложению прежней сессии. */
    isCurrentSession: (generation: number) => boolean;
    /** Применение снапшота черновика в сторы билдера. */
    applySnapshot: (snapshot: IBuilderDraftSnapshot) => void;
    /** Удаление черновика с сообщением о недоступном хранилище. */
    discardDraft: (address: IBricksPageAddress) => void;
    /** Адрес сессии — запасной ключ удаления, если у самого черновика его нет. */
    sessionAddress: Ref<IBricksPageAddress>;
    /**
     * Сохранённая версия открытой страницы — эталон, по которому правка
     * пользователя отличается от служебной перезаписи формы.
     */
    savedSnapshot: Ref<IBuilderDraftSnapshot | null>;
}

/**
 * Опции composable useBuilderDraftPersistence.
 */
export interface IBuilderDraftPersistenceOptions {
    routeAddress: ComputedRef<IBricksPageAddress>;
    sessionAddress: Ref<IBricksPageAddress>;
    isSessionLoading: Ref<boolean>;
    isSessionReady: Ref<boolean>;
    /**
     * Черновик найден, ответа на него нет. Запрещает автосейву и трогать запись
     * черновика, и удалять её: на канвасе сохранённая версия, и сравнение с
     * `savedSnapshot` снесло бы предложенный снапшот до ответа пользователя.
     */
    isDraftRestorePending: Ref<boolean>;
    savedSnapshot: Ref<IBuilderDraftSnapshot | null>;
    buildCurrentSnapshot: () => IBuilderDraftSnapshot;
    /**
     * Сообщение о недоступном хранилище: проба на входе в сессию и отказ записи
     * по ходу работы ведут в него же. Латч — внутри самого уведомления, автосейв
     * повторяет попытку каждые ~800 мс, и сообщение на каждую было бы шумом.
     */
    draftStorageNotice: IDraftStorageNotice;
}

/**
 * Опции composable useBuilderSessionAddressSync.
 */
export interface IBuilderSessionAddressSyncOptions {
    renameSession: TRenameBuilderSession;
    isSessionReady: Ref<boolean>;
}
// #endregion

// #region useComponentLibrary
/**
 * Данные библиотеки компонентов в кеше `useAsyncData('bricks-components')`:
 * записи манифеста и хеш, с которым пришёл ответ ручки. Хеш лежит рядом с
 * записями, чтобы сверять было с чем — заготовка под сверку хешей в dev,
 * потребителя у поля пока нет.
 *
 * Метаданные и хеш описывают один и тот же ответ: и то и другое приходит
 * манифестом, который генератор собирает разбором brick-файлов на build-time.
 */
export interface IComponentLibraryData {
    /** Хеш манифеста brick-компонентов из ответа ручки компонентов. */
    hash: string;
    /**
     * Прогон деградировал: манифест не дошёл за SSR-дедлайн, записей нет и в
     * библиотеке остаются одни layout-блоки. Поле обязательное, а не
     * опциональное, чтобы ветка, забывшая его выставить, не выдавала неполный
     * результат за полный.
     *
     * Смысл узкий: «ответ ручки не дошёл за дедлайн, поэтому список деградирован».
     * Обычный отказ ручки маркером не кодируется — он живёт в `error` того же
     * `useAsyncData` (клиентское восстановление повторяет оба исхода, но различает
     * их по источнику). Запись без лоадера в сборке сюда не попадает вовсе:
     * список после неё полон настолько, насколько это возможно, и повтор такой
     * пропуск не исправит.
     */
    isPartial: boolean;
    /**
     * Записи манифеста как есть. Хранится именно ответ ручки, а не собранный по
     * нему список: из одних и тех же записей выводятся карточки библиотеки,
     * опции модалок, пропуски и индекс метаданных, и две копии одного ответа
     * рано или поздно разъехались бы. На гидрации handler не исполняется —
     * записи приезжают в payload и восстанавливают всё перечисленное.
     */
    bricks: IBrickManifestEntry[];
}

/**
 * Возвращаемое значение composable useComponentLibrary.
 */
export interface IUseComponentLibraryReturn {
    componentLibraryList: ComputedRef<IComponentLibraryItem[]>;
    /**
     * Записи манифеста, не доехавшие до библиотеки. Показанного списка по ним не
     * восстановить: пользователь иначе видит библиотеку, молча лишённую части
     * компонентов, при полном отсутствии признаков отказа.
     */
    skippedBricks: ComputedRef<ISkippedBrick[]>;
    /**
     * Отказ загрузки манифеста. Отдельно от пустого списка: layout-блоки
     * остаются доступны и при отказе, то есть по составу списка отказ неотличим.
     */
    isComponentLibraryLoadFailed: ComputedRef<boolean>;
    isComponentLibraryLoading: ComputedRef<boolean>;
    /** Повторяет загрузку; возвращает признак успеха. */
    refreshComponentLibrary: () => Promise<boolean>;
}
// #endregion

// #region usePageThumbnail
/**
 * Ответ POST /api/bricks/media/s3-page-thumbnail.
 */
export interface IThumbnailUploadResponse {
    success: boolean;
    url: string;
}

/**
 * Возвращаемое значение composable usePageThumbnail.
 */
export interface IUsePageThumbnailReturn {
    captureAndUploadThumbnail: (pageId: string | number, startedIn: number) => Promise<void>;
}
// #endregion

// #region useBuilderPageWrite
/**
 * Опции composable useBuilderPageWrite: всё, что принадлежит composition root'у,
 * а не самой записи — токен сессии, её перенос и фиксация, открытие панели
 * публикации для подсветки полей.
 */
export interface IBuilderPageWriteOptions {
    sessionToken: IBuilderSessionToken;
    renameSession: TRenameBuilderSession;
    switchToSavedPage: TSwitchToSavedPage;
    commitSavedSnapshot: TCommitSavedSnapshot;
    ensurePublishSettingsVisible: (message: string) => void;
}

/**
 * Возвращаемое значение composable useBuilderPageWrite.
 */
export interface IUseBuilderPageWriteReturn {
    isEditingExistingPage: ComputedRef<boolean>;
    currentPublishPageTitle: ComputedRef<string>;
    handleSaveDraft: () => Promise<void>;
    handleSaveAsCopy: () => Promise<void>;
}
// #endregion

// #region useBuilderPage
/**
 * Мост inline-редактора (editor → media-галерея и сброс сессии).
 * Собирается composition root'ом из editor-store, чтобы builder-ядро не импортировало editor.
 */
export interface IInlineMediaBridge {
    isRequestingMedia: ComputedRef<boolean>;
    resolveMediaRequest: (item: IMediaItem) => void;
    cancelMediaRequest: () => void;
    /**
     * Гасит inline-редактирование. Его состояние переживает смену схемы канваса:
     * `loadSchema` сбрасывает только `selectedComponent`, а `componentId` и
     * экземпляр редактора остаются от компонента, которого на новом канвасе
     * уже нет.
     */
    cancelInlineEditing: () => void;
}

/**
 * Опции composable useBuilderPage.
 */
export interface IBuilderPageOptions {
    inlineMediaBridge: IInlineMediaBridge;
    renameSession: TRenameBuilderSession;
    switchToSavedPage: TSwitchToSavedPage;
    commitSavedSnapshot: TCommitSavedSnapshot;
    sessionToken: IBuilderSessionToken;
}

/**
 * Возвращаемое значение composable useBuilderPage.
 */
export interface IUseBuilderPageReturn {
    sidebarStore: ReturnType<typeof useSidebarStore>;
    publishStore: ReturnType<typeof usePublishStore>;
    componentLibraryList: ComputedRef<IComponentLibraryItem[]>;
    /** Записи манифеста, не доехавшие до библиотеки, — для предупреждения в сайдбаре. */
    skippedBricks: ComputedRef<ISkippedBrick[]>;
    isComponentLibraryLoadFailed: ComputedRef<boolean>;
    isComponentLibraryLoading: ComputedRef<boolean>;
    handleRetryComponentLibrary: () => Promise<void>;
    /**
     * Сообщает об отказе загрузки библиотеки тостом. Зовётся страницей из
     * `onMounted`: composable await'ится и на SSR, где показывать его некому.
     */
    notifyComponentLibraryFailure: () => void;
    isDocumentationModalOpen: Ref<boolean>;
    shouldMountMediaGallery: Ref<boolean>;
    isMediaGalleryModalOpen: Ref<boolean>;
    mediaGalleryContext: Ref<TMediaGalleryContext>;
    sidebarRef: Ref<ISidebarExpose | null>;
    propertiesPanelRef: Ref<ISidebarExpose | null>;
    toast: IBuilderToastState;
    isEditingExistingPage: ComputedRef<boolean>;
    hasSelectedComponent: ComputedRef<boolean>;
    leftSidebarOffset: ComputedRef<string>;
    currentPublishPageTitle: ComputedRef<string>;
    handleKeyDown: (event: KeyboardEvent) => void;
    showToast: TShowToast;
    handleToggleLibrary: () => void;
    handleToggleSchema: () => void;
    handleOpenPublishSettings: () => void;
    handleOpenDocs: () => void;
    handleCloseDocs: () => void;
    handleMediaError: (message: string) => void;
    handleOpenMediaGallery: (context?: TMediaGalleryContext) => void;
    handleCloseMediaGallery: () => void;
    handleMediaSelect: (item: IMediaItem) => void;
    handleSaveDraft: () => Promise<void>;
    handleSaveAsCopy: () => Promise<void>;
    handlePreview: () => Promise<void>;
}
// #endregion

// #region useBuilderPageSelector
/**
 * Опции composable useBuilderPageSelector: всё, чем селектор связан с открытой
 * сессией. Своего состояния сессии у него нет.
 */
export interface IBuilderPageSelectorOptions {
    /** Идентичность открытой страницы: по ней отсекается выбор самой себя. */
    sessionPageId: Ref<string | number | null>;
    routeAddress: ComputedRef<IBricksPageAddress>;
    /**
     * Токен сессии: создание страницы переживает переход на другую страницу
     * билдера (модалка портальная, страница не перемонтируется), и переход в
     * созданную страницу имеет смысл только для той сессии, где её создавали.
     */
    sessionToken: IBuilderSessionToken;
    showToast: TShowToast;
}

/**
 * Возвращаемое значение composable useBuilderPageSelector.
 */
export interface IUseBuilderPageSelectorReturn {
    /** Идёт догрузка или освежение списка страниц. */
    isPagesRefreshing: Ref<boolean>;
    /** Модалку создания уже открывали — с этого момента её чанк смонтирован. */
    shouldMountCreatePageModal: Ref<boolean>;
    isCreatePageModalOpen: Ref<boolean>;
    schemaImport: IUsePublishSchemaImportReturn;
    handleOpenPageSelector: () => Promise<void>;
    handleSelectPage: (page: TPublishedPageSummary) => Promise<void>;
    handleOpenCreatePage: () => void;
    handleCloseCreatePage: () => void;
    handlePageCreated: (address: IBricksPageAddress) => Promise<void>;
}
// #endregion
