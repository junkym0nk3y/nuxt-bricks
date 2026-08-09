/**
 * Контрактные data-типы медиа — часть схемы данных всей системы.
 * UI-типы галереи и серверные типы обработки остаются в media/types/media.d.ts.
 */

import type { TBricksMediaImageFormat } from './config';

/**
 * Параметры оптимизации растра при загрузке.
 *
 * Один тип на клиент и сервер: клиент кладёт эти три поля в multipart-форму,
 * сервер их оттуда читает — то есть это форма запроса, а не деталь одной из
 * сторон. Прежде тип был объявлен дважды (плюс формат — трижды), и копии
 * разъезжались молча.
 */
export interface IBricksMediaOptimization {
    format: TBricksMediaImageFormat;
    quality: number;
    maxWidth: number;
}

export interface IMediaItem {
    id: number;
    url: string;
    filename: string;
    alt: string;
    size: number;
    uploadedAt: string;
    mimeType: string;
    /** null — файл без категории: он виден только в фильтре «Все». */
    category: string | null;
    thumbnailUrl?: string;
    svgContent: string | null;
    /**
     * Пиксельные размеры растра; null — неизвестны (svg, видео, внешний URL или
     * файл, загруженный до того, как размеры начали сохраняться).
     */
    width: number | null;
    height: number | null;
    /**
     * Уменьшенные варианты для постепенной загрузки: preview (~480px) и
     * mock (~32px). null — варианта нет (svg, видео, внешний URL, файл загружен
     * до появления вариантов); потребитель в этом случае обязан сразу показать
     * полный файл, а не пустоту.
     */
    previewUrl: string | null;
    mockUrl: string | null;
}

export interface IMediaUpdateMetaRequest {
    filename?: string;
    alt?: string;
}

export interface IMediaListResponse {
    success: boolean;
    items: IMediaItem[];
    error?: string;
}

export interface IMediaUpdateCategoryRequest {
    /** null снимает категорию с файла. */
    category: string | null;
}

export type TMediaGalleryContext = 'manager' | 'publish' | 'properties';

/**
 * Категория медиатеки. `slug` уезжает в `bricks_media.category` и в фильтр
 * галереи, `label` — подпись, введённая пользователем (переводить её нечем).
 *
 * Предустановленных категорий нет: набор целиком заводит пользователь, и
 * удалить можно любую — файлы удалённой остаются в медиатеке без категории.
 */
export interface IMediaCategory {
    id: number;
    slug: string;
    label: string;
    sortOrder: number;
}

export interface IMediaCategoryListResponse {
    success: boolean;
    items: IMediaCategory[];
    error?: string;
}

export interface IMediaCategoryCreateRequest {
    /** Подпись, введённая пользователем; slug генерирует сервер. */
    label: string;
}

/**
 * Ответ удаления категории: у скольких файлов она снята. Число нужно показать —
 * «удалили категорию» и «12 файлов остались без категории» это разные события.
 */
export interface IMediaCategoryDeleteResponse {
    success: boolean;
    clearedCount: number;
}
