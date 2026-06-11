/**
 * Контракты persistence-слоя (Шаг 6 рефакторинга).
 *
 * IStorageAdapter — CRUD страниц и медиа-метаданных (дефолт — Postgres).
 * IPublishAdapter — файловое хранилище публикации (дефолт — S3/Yandex).
 *
 * Кастомный адаптер потребитель регистрирует из своего Nitro-плагина через
 * сеттеры в `modules/persistence/server/registry.ts`.
 */
import type {
    IBricksPageRow,
    ICreatePagePayload,
    IUpdatePagePayload,
    IPublishedPageSummary,
} from '../../common/types/bricks-api';
import type { IMediaItem } from '../../common/types/media';

/**
 * Данные для создания записи медиа (id и uploadedAt генерирует хранилище).
 */
export interface ICreateMediaPayload {
    url: string;
    filename: string;
    size: number;
    mimeType: string;
    category: string;
    svgContent?: string | null;
    alt?: string;
    uploadedAt?: string;
}

/**
 * Частичное обновление метаданных медиа.
 */
export type TUpdateMediaPayload = Partial<Pick<IMediaItem, 'filename' | 'alt' | 'category'>>;

/**
 * CRUD страниц билдера и медиа-метаданных.
 */
export interface IStorageAdapter {
    listPages(): Promise<IBricksPageRow[]>;
    listPublishedPages(): Promise<IPublishedPageSummary[]>;
    getPage(id: number): Promise<IBricksPageRow | null>;
    getPageByPagename(pagename: string): Promise<IBricksPageRow | null>;
    createPage(payload: ICreatePagePayload): Promise<IBricksPageRow>;
    updatePage(id: number, payload: IUpdatePagePayload): Promise<IBricksPageRow | null>;
    deletePage(id: number): Promise<boolean>;
    listMedia(): Promise<IMediaItem[]>;
    getMediaByUrl(url: string): Promise<IMediaItem | null>;
    createMedia(payload: ICreateMediaPayload): Promise<IMediaItem>;
    updateMedia(id: number, payload: TUpdateMediaPayload): Promise<IMediaItem | null>;
    deleteMedia(id: number): Promise<boolean>;
}

/**
 * Параметры загрузки файла в хранилище публикации.
 */
export interface IUploadFileParams {
    buffer: Buffer;
    mimeType: string;
    key: string;
}

/**
 * Результат загрузки файла.
 */
export interface IUploadedFile {
    url: string;
    key: string;
    size: number;
}

/**
 * Описание файла в хранилище (для импорта существующих медиа).
 */
export interface IStoredFileInfo {
    key: string;
    url: string;
    size: number;
    lastModified: string;
}

/**
 * Файловое хранилище публикации (медиа-файлы).
 */
export interface IPublishAdapter {
    uploadFile(params: IUploadFileParams): Promise<IUploadedFile>;
    deleteFile(url: string): Promise<void>;
    listFiles(prefix?: string): Promise<IStoredFileInfo[]>;
}
