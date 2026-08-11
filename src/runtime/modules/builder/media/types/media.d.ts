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
    /** Общее число файлов медиатеки — счётчик таба «Все». */
    totalCount: number;
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
    totalCount: number;
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
