/**
 * Media gallery UI types.
 * Контрактные data-типы (IMediaItem, ответы API, TMediaGalleryContext)
 * живут в common/types/media.d.ts; серверные типы обработки — в persistence/types/media.d.ts.
 */

import type {
    IMediaItem,
    IMediaUpdateMetaRequest,
    TMediaGalleryContext,
} from '../../../common/types/media';

export interface IMediaGalleryProps {
    visible: boolean;
    context?: TMediaGalleryContext;
}

export interface IMediaGalleryEmits {
    close: [];
    select: [item: IMediaItem];
    error: [message: string];
}

export interface IMediaUploadOptions {
    /** Возвращает категорию, присваиваемую загружаемым файлам. */
    resolveCategory: () => string;
    /** Колбэк для ошибок валидации (превышение лимита размера). */
    onError: (message: string) => void;
}

export interface IMediaGalleryFiltersProps {
    categoryFilter: string;
    searchQuery: string;
}

export interface IMediaGalleryFiltersEmits {
    'update:categoryFilter': [value: string];
    'update:searchQuery': [value: string];
}

export interface IMediaGalleryUploadAreaProps {
    maxImageSizeMb: number;
    maxVideoSizeMb: number;
}

export interface IMediaGalleryUploadAreaEmits {
    upload: [files: File[]];
}

export interface IMediaGalleryGridProps {
    items: IMediaItem[];
    selectedItemId: number | null;
}

export interface IMediaGalleryGridEmits {
    select: [item: IMediaItem];
    preview: [item: IMediaItem];
}

export interface IMediaGalleryMetaPanelProps {
    selectedItem: IMediaItem | null;
}

export interface IMediaGalleryMetaPanelEmits {
    'update-meta': [meta: IMediaUpdateMetaRequest];
    'update-category': [category: string];
    remove: [];
}

export interface IMediaGalleryPreviewLightboxProps {
    item: IMediaItem | null;
}

export interface IMediaGalleryPreviewLightboxEmits {
    close: [];
}
