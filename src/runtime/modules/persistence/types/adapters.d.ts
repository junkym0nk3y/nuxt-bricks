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

/**
 * Запись пользователя database-auth (включая хеш пароля — только для verify).
 */
export interface IAuthUserRecord {
    id: number;
    username: string;
    /** Самоописывающий формат scrypt:N:r:p:saltB64:hashB64. */
    passwordHash: string;
    isActive: boolean;
}

/**
 * Пользователь авторизованной сессии (без секретов — уходит в event.context и клиенту).
 */
export interface IAuthSessionUser {
    id: number;
    username: string;
    isActive: boolean;
}

/**
 * Сессия вместе с пользователем (JOIN bricks_sessions × bricks_users).
 */
export interface IAuthSessionWithUser {
    tokenHash: string;
    expiresAt: string;
    lastUsedAt: string;
    user: IAuthSessionUser;
}

/**
 * Данные для создания cookie-сессии (в БД хранится только SHA-256 токена).
 */
export interface ICreateAuthSessionPayload {
    tokenHash: string;
    userId: number;
    expiresAt: Date;
}

/**
 * Хранилище пользователей и cookie-сессий database-auth (дефолт — Postgres).
 */
export interface IAuthAdapter {
    getUserByUsername(username: string): Promise<IAuthUserRecord | null>;
    /** Возвращает только непросроченную сессию (просроченная неотличима от отсутствующей). */
    getSessionWithUser(tokenHash: string): Promise<IAuthSessionWithUser | null>;
    createSession(payload: ICreateAuthSessionPayload): Promise<void>;
    deleteSession(tokenHash: string): Promise<void>;
    /** Удаляет просроченные сессии; возвращает количество удалённых. */
    deleteExpiredSessions(): Promise<number>;
    /** Sliding-продление: обновляет expires_at и last_used_at. */
    touchSession(tokenHash: string, expiresAt: Date): Promise<void>;
}
