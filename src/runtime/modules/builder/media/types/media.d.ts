/**
 * Media gallery UI types.
 * Контрактные data-типы (IMediaItem, ответы API, TMediaGalleryContext)
 * живут в common/types/media.d.ts; серверные типы обработки — в persistence/types/media.d.ts.
 */

import type { ComputedRef, Ref } from 'vue';
import type {
    IBricksMediaOptimization,
    IMediaCategory,
    IMediaItem,
    IMediaUpdateMetaRequest,
    TMediaGalleryContext,
} from '../../../common/types/media';

export interface IMediaGalleryProps {
    visible: boolean;
    context?: TMediaGalleryContext;
}

/**
 * Поле элемента, которым владеет запись. Номер записи ведётся по полю, а не по
 * элементу: правки разных полей одного файла уходят разными PATCH'ами и друг
 * другу не противоречат — общий счётчик глушил бы ответ соседней правки.
 */
export type TMediaItemWriteField = 'filename' | 'alt' | 'category';

/**
 * Зависимости приёмника файлов галереи.
 */
export interface IMediaGalleryFileDropOptions {
    /** Принимает брошенные файлы. */
    onFiles: (files: File[]) => void;
    /**
     * Принимает ли приёмник файлы сейчас; не задан — принимает всегда.
     * Нужен там, где право на загрузку зависит от роли: оверлей приёмника —
     * такое же приглашение загрузить файл, как и кнопка.
     */
    isEnabled?: () => boolean;
}

/**
 * Состояние и обработчики приёмника файлов галереи.
 */
export interface IMediaGalleryFileDrop {
    /** Сколько файлов тащат над модалкой; 0 — перетаскивания нет. */
    draggedFileCount: Ref<number>;
    isDraggingFiles: ComputedRef<boolean>;
    handleDragOver: (event: DragEvent) => void;
    handleDragEnter: (event: DragEvent) => void;
    handleDragLeave: () => void;
    handleDrop: (event: DragEvent) => void;
    /** Сворачивает приёмник (закрытие галереи). */
    resetFileDrop: () => void;
}

export interface IMediaGalleryEmits {
    close: [];
    select: [item: IMediaItem];
    error: [message: string];
}

/**
 * Прогресс загрузки набора файлов. Считается по файлам, а не по байтам: отдача
 * идёт одним `$fetch` на файл, и байтового прогресса у него нет.
 */
export interface IMediaUploadProgress {
    /** Номер файла, который грузится сейчас (1-based). */
    current: number;
    total: number;
    filename: string;
}

export interface IMediaUploadOptions {
    /** Возвращает категорию для загружаемых файлов; null — загрузка без категории. */
    resolveCategory: () => string | null;
    /** Возвращает параметры оптимизации для загрузки. */
    resolveOptimization: () => IBricksMediaOptimization;
    /** Колбэк для ошибок валидации (превышение лимита размера). */
    onError: (message: string) => void;
}

export interface IMediaGalleryFiltersProps {
    categoryFilter: string;
    categories: IMediaCategory[];
    /** Число файлов в каждой категории по slug — счётчик в табе. */
    categoryCounts: Record<string, number>;
    /**
     * Общее число файлов медиатеки — счётчик таба «Все»; `null` — состав ещё не
     * прочитан, и счётчик не рисуется вовсе: ноль на его месте утверждал бы,
     * что файлов нет.
     */
    totalCount: number | null;
    /** Идёт создание категории — поле ввода в состоянии ожидания. */
    isCreatingCategory: boolean;
}

export interface IMediaGalleryFiltersEmits {
    'update:categoryFilter': [value: string];
    'create-category': [label: string];
    'delete-category': [slug: string];
}

export interface IMediaGalleryCategoryTabsProps {
    modelValue: string;
    categories: IMediaCategory[];
    categoryCounts: Record<string, number>;
    /** `null` — состав ещё не прочитан, счётчик таба «Все» скрыт. */
    totalCount: number | null;
    /** Режим управления: у категорий показаны крестики удаления. */
    isManaging: boolean;
}

export interface IMediaGalleryCategoryTabsEmits {
    'update:modelValue': [value: string];
    'delete-category': [slug: string];
}

export interface IMediaGalleryUploadControlsProps {
    maxImageSizeMb: number;
    maxVideoSizeMb: number;
    optimization: IBricksMediaOptimization;
    /** Ширина из конфига — от неё считаются границы поля, см. одноимённый проп поповера. */
    configuredMaxWidth: number;
    /** Прогресс текущей загрузки; null — загрузки нет. */
    uploadProgress: IMediaUploadProgress | null;
    /**
     * Показывать шестерёнку параметров рядом с кнопкой. В разделе дашборда она
     * стоит в строке фильтров — рядом с дорожкой категорий, то есть рядом с тем,
     * от чего зависит категория загружаемых файлов, — и в шапке была бы второй.
     */
    showOptions?: boolean;
    /**
     * Подсказка о том, куда можно бросить файл. Не задана — «прямо в окно», как
     * в модалке; раздел дашборда передаёт свою: приёмник там ограничен телом
     * раздела, и шапка с рейлом файл не принимают.
     */
    dropHint?: string;
}

export interface IMediaGalleryUploadControlsEmits {
    upload: [files: File[]];
    'update:optimization': [value: IBricksMediaOptimization];
}

/**
 * Оверлей приёмника, разворачивающийся над сеткой при перетаскивании файлов.
 * Постоянной зоны загрузки нет — точка входа живёт в шапке и первой ячейкой
 * сетки, а приёмник показывается ровно тогда, когда файлы уже над окном.
 */
export interface IMediaGalleryDropOverlayProps {
    /** Сколько файлов тащат — из dataTransfer.items. */
    fileCount: number;
    maxImageSizeMb: number;
    maxVideoSizeMb: number;
    optimization: IBricksMediaOptimization;
}

/**
 * Шестерёнка параметров оптимизации с поповером. Сторона подсказки — пропом:
 * в шапке модалки тултип уходит вниз, в строке фильтров раздела — вверх, чтобы
 * не накрывать сетку.
 */
export interface IMediaGalleryUploadOptionsPopoverProps {
    optimization: IBricksMediaOptimization;
    /** Ширина из конфига — от неё считаются границы поля, см. панель параметров. */
    configuredMaxWidth: number;
    tooltipSide?: 'top' | 'bottom';
}

export interface IMediaGalleryUploadOptionsPopoverEmits {
    'update:optimization': [value: IBricksMediaOptimization];
}

export interface IMediaGalleryUploadOptionsProps {
    optimization: IBricksMediaOptimization;
    /**
     * Ширина из конфига модуля. Отдельным пропом, а не из `optimization`:
     * границы поля должны считаться от неизменного значения, иначе введённое
     * пользователем число само поднимало бы себе потолок.
     */
    configuredMaxWidth: number;
}

export interface IMediaGalleryUploadOptionsEmits {
    'update:optimization': [value: IBricksMediaOptimization];
}

export interface IMediaGalleryGridProps {
    items: IMediaItem[];
    selectedItemId: number | null;
    /** Показать плитку-скелет первым элементом (идёт загрузка). */
    showSkeleton: boolean;
    /** Показать первой ячейкой плитку-приёмник загрузки. */
    showUploadTile: boolean;
}

export interface IMediaGalleryGridEmits {
    select: [item: IMediaItem];
    preview: [item: IMediaItem];
    upload: [];
}

/**
 * Что композаблу черновиков нужно от вызывающего: выбранный файл и приём
 * готовой правки.
 *
 * Файл — геттером, а не `Ref`: у мета-панели он приходит пропом, который бывает
 * `null`, у панели деталей — пропом, который `null` быть не может, и общий
 * `Ref<IMediaItem | null>` не принял бы второй (Ref инвариантен).
 */
export interface IMediaMetaDraftsOptions {
    item: () => IMediaItem | null;
    onCommit: (meta: IMediaUpdateMetaRequest) => void;
}

/** Черновики полей файла и коммит правки по уходу фокуса. */
export interface IMediaMetaDrafts {
    filename: Ref<string>;
    alt: Ref<string>;
    commit: () => void;
}

/**
 * Тело раздела «Медиатека» на дашборде: дорожка категорий, сетка и приёмник.
 *
 * Категория, выбранный файл и параметры загрузки приходят пропами, а не живут
 * внутри: кнопка загрузки стоит в шапке дашборда, а панель деталей — в слоте
 * оболочки, то есть оба вне раздела. Разделу остаётся то, что целиком его:
 * управление категориями, фильтрация списка и перетаскивание файлов.
 */
export interface IMediaSectionProps {
    /** Строка поиска из шапки дашборда. */
    searchQuery: string;
    /** Активная категория дорожки. */
    categoryFilter: string;
    /** Выбранный файл — подсвеченная плитка; `null` — выбора нет. */
    selectedItemId: number | null;
    maxImageSizeMb: number;
    maxVideoSizeMb: number;
    /** Параметры загрузки: их показывает оверлей приёмника и правит поповер ряда. */
    uploadOptimization: IBricksMediaOptimization;
    /** Ширина из конфига — от неё считаются границы поля в параметрах загрузки. */
    configuredMaxWidth: number;
}

export interface IMediaSectionEmits {
    'update:categoryFilter': [value: string];
    'update:uploadOptimization': [value: IBricksMediaOptimization];
    select: [item: IMediaItem];
    preview: [item: IMediaItem];
    upload: [files: File[]];
    /**
     * Плитка-приёмник просит открыть системный выбор файлов: сам input живёт в
     * контролах шапки, второй такой же означал бы две точки правды о том, какие
     * типы файлов принимаются.
     */
    'request-upload': [];
    /** Пустой результат: снять разом и категорию, и строку поиска. */
    'reset-filters': [];
    notify: [message: string, variant: 'success' | 'error'];
}

/**
 * Панель деталей файла в разделе «Медиатека».
 *
 * Тот же контейнер, что у панели деталей страницы, и те же контролы, что в
 * мета-панели модалки. Горизонтальная полоса модалки в раздел не переезжает: у
 * остальных отделов дашборда такой полосы нет, и раздел читался бы как
 * встроенная модалка.
 */
export interface IMediaSectionDetailsPanelProps {
    item: IMediaItem;
    categories: IMediaCategory[];
}

export interface IMediaSectionDetailsPanelEmits {
    close: [];
    'update-meta': [meta: IMediaUpdateMetaRequest];
    'update-category': [category: string | null];
    remove: [];
    /** «Открыть во весь экран»: лайтбокс на дашборде один, и он в хосте. */
    preview: [];
    notify: [message: string, variant: 'success' | 'error'];
}

export interface IMediaGalleryMetaPanelProps {
    selectedItem: IMediaItem | null;
    categories: IMediaCategory[];
    /** Показывать кнопки «Отменить» / «Выбрать» (контекст выбора картинки). */
    showPickerActions: boolean;
}

export interface IMediaGalleryMetaPanelEmits {
    'update-meta': [meta: IMediaUpdateMetaRequest];
    'update-category': [category: string | null];
    remove: [];
    close: [];
    insert: [];
}

/**
 * Минимальные данные для полноэкранного лайтбокса — позволяет переиспользовать
 * его вне галереи (например, превью страницы в publish-дашборде).
 */
export type TMediaLightboxItem = Pick<IMediaItem, 'url' | 'mimeType'> &
    Partial<Pick<IMediaItem, 'alt' | 'filename'>>;

export interface IMediaGalleryPreviewLightboxProps {
    item: TMediaLightboxItem | null;
}

export interface IMediaGalleryPreviewLightboxEmits {
    close: [];
}

/**
 * Файл в очереди загрузки вместе с параметрами своего набора: категория и
 * параметры оптимизации фиксируются на момент постановки в очередь, иначе смена
 * фильтра или настроек по ходу переписала бы уже принятое задание.
 */
export interface IMediaUploadQueueEntry {
    file: File;
    /** null — файл грузится без категории. */
    category: string | null;
    optimization: IBricksMediaOptimization;
}

/**
 * Что композаблу действий над категориями нужно от вызывающего: счётчик файлов
 * для текста подтверждения, реакция на удаление (сброс фильтра, указывающего на
 * исчезнувшую категорию) и показ ошибки.
 */
export interface IMediaCategoryActionsOptions {
    resolveCategoryCount: (slug: string) => number;
    onCategoryDeleted: (slug: string) => void;
    onError: (message: string) => void;
}

/** Состояние и обработчики ряда чипов категорий вместе с подтверждением удаления. */
export interface IMediaCategoryActions {
    categories: ComputedRef<IMediaCategory[]>;
    isCreatingCategory: Ref<boolean>;
    categoryPendingDeletion: Ref<string | null>;
    isDeletingCategory: Ref<boolean>;
    deleteCategoryTitle: ComputedRef<string>;
    deleteCategoryDescription: ComputedRef<string>;
    handleCreateCategory: (label: string) => Promise<void>;
    handleRequestCategoryDelete: (slug: string) => void;
    handleCloseCategoryDelete: () => void;
    handleConfirmCategoryDelete: () => Promise<void>;
    resetCategoryActions: () => void;
}
