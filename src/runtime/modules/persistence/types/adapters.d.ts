/**
 * Контракты persistence-слоя.
 *
 * IStorageAdapter — CRUD страниц и медиа-метаданных (дефолт — Postgres).
 * IPublishAdapter — файловое хранилище публикации (дефолт — S3/Yandex).
 *
 * Кастомный адаптер потребитель регистрирует из своего Nitro-плагина через
 * сеттеры в `modules/persistence/server/registry.ts`.
 */
import type {
    IBricksPageRow,
    TBricksPageSummaryRow,
    ICreatePagePayload,
    IUpdatePagePayload,
    IPageVersionSummary,
    IPageVersion,
} from '../../common/types/bricks-api';
import type { IMediaItem } from '../../common/types/media';
import type { IBricksPageAddress } from '../../common/types/pageAddress';

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
    /**
     * Readiness-проверка хранилища для `GET /api/bricks/health/ready`:
     * resolve — хранилище доступно, reject — ручка ответит 503. Метод
     * опциональный, но адаптер без него НЕ считается готовым автоматически:
     * readiness выполняет fallback-пробу `listPages()` — минимальный реальный
     * editorial-запрос. Дефолтный Postgres-адаптер выполняет
     * `SELECT 1` (и пропускает проверку, если строка подключения не
     * сконфигурирована — proxy-режим без локальной БД).
     *
     * Production-адаптеры ДОЛЖНЫ реализовать этот метод: дешёвая целевая
     * проверка вместо fallback-листинга, который может быть дорогим и
     * выполняется на каждый probe оркестратора.
     */
    checkHealth?(): Promise<void>;
    /**
     * Сводки всех страниц БЕЗ поля `schema` (editorial-список: дашборд,
     * preview-резолвер). Полную строку со schema обязан отдавать только
     * point-lookup getPage/getPageByAddress.
     */
    listPages(): Promise<TBricksPageSummaryRow[]>;
    getPage(id: number): Promise<IBricksPageRow | null>;
    /**
     * Страница по полному адресу (`urlPrefix` + `pagename`); null — если её нет.
     *
     * По адресу, а не по имени: имя уникально только внутри своего префикса, и
     * lookup по нему возвращал бы произвольную из одноимённых страниц. Реализация
     * обязана считать отсутствие префикса значением, а не «любым префиксом»:
     * `/post` не должен находиться по адресу `/blog/post` и наоборот.
     */
    getPageByAddress(address: IBricksPageAddress): Promise<IBricksPageRow | null>;
    createPage(payload: ICreatePagePayload): Promise<IBricksPageRow>;
    /**
     * Обновляет переданные поля страницы; null — если страница не найдена.
     *
     * Контракт версионирования: если в payload присутствует `schema` и лимит
     * версий (`bricks.versionsLimit` / env NUXT_BRICKS_VERSIONS_LIMIT) больше 0,
     * реализация обязана атомарно снапшотить ПРЕЖНЮЮ строку в историю версий
     * и обрезать историю страницы до лимита. Кастомный адаптер сам отвечает
     * за свою стратегию снапшотов.
     */
    updatePage(id: number, payload: IUpdatePagePayload): Promise<IBricksPageRow | null>;
    deletePage(id: number): Promise<boolean>;
    /** Сводки сохранённых версий страницы (без schema), новые сверху. */
    listPageVersions(pageId: number): Promise<IPageVersionSummary[]>;
    /** Полный снапшот версии; null — если версия не принадлежит странице или не найдена. */
    getPageVersion(pageId: number, versionId: number): Promise<IPageVersion | null>;
    listMedia(): Promise<IMediaItem[]>;
    /** Возвращает медиа-запись по id или null. */
    getMedia(id: number): Promise<IMediaItem | null>;
    getMediaByUrl(url: string): Promise<IMediaItem | null>;
    /**
     * Создаёт медиа-запись и возвращает её с id.
     *
     * Контракт идемпотентности: `url` уникален; повторная регистрация того же
     * URL (гонка импорта из бакета, ретрай клиента) обязана вернуть уже
     * существующую запись, а не падать и не создавать дубликат.
     */
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
 * Тип файла хранилища публикации — определяет namespace-префикс ключа.
 */
export type TPublishFileKind = 'media' | 'thumbnail';

/**
 * Файловое хранилище публикации (медиа-файлы).
 *
 * Managed namespace: адаптер владеет ограниченным набором префиксов ключей
 * (для S3-дефолта — `prefix` и `thumbnailsPrefix` конфигурации). Все ключи
 * строятся через `buildFileKey`, а `deleteFile`/`isOwnedUrl` обязаны отказывать
 * ключам вне namespace — в shared-бакете модуль не должен уметь трогать
 * посторонние объекты даже по синтаксически валидному URL бакета.
 */
export interface IPublishAdapter {
    /**
     * Строит полный object key для нового файла модуля (server-generated:
     * клиентские имена в ключ не попадают). Единственный источник префиксов —
     * сами ручки ключи не собирают.
     */
    buildFileKey(kind: TPublishFileKind, filename: string): string;
    uploadFile(params: IUploadFileParams): Promise<IUploadedFile>;
    /**
     * Удаляет файл по публичному URL. Обязан бросить ошибку, если URL не
     * принадлежит собственному хранилищу или ключ лежит вне managed namespace.
     */
    deleteFile(url: string): Promise<void>;
    listFiles(prefix?: string): Promise<IStoredFileInfo[]>;
    /**
     * Проверяет, что URL указывает на файл собственного хранилища
     * внутри managed namespace.
     *
     * Anti-SSRF-контракт: сервер проксирует (/api/bricks/media/s3-proxy) и
     * удаляет (media orchestration) только URL, прошедшие эту проверку —
     * произвольные хосты (localhost, cloud metadata, private network) не должны
     * её проходить. Кастомная реализация обязана сверять URL со СВОИМ
     * хранилищем (включая префикс ключа), а не с форматом URL вообще.
     */
    isOwnedUrl(url: string): boolean;
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

/**
 * Опции уборки файлов превью страницы (`prunePageThumbnails`).
 */
export interface IPrunePageThumbnailsOptions {
    /**
     * Снимает защиту недавно загруженных файлов. Ставится при удалении
     * страницы: следующего прохода уборки там не будет, и отложенный файл
     * остался бы в хранилище навсегда.
     */
    includeRecentUploads?: boolean;
}

/**
 * Зависимости уборки сирот после загрузки кадра (`prunePageThumbnailsAfterUpload`):
 * узкие Pick-контракты вместо полных адаптеров — логика тестируется без
 * Postgres и S3.
 */
export interface IPageThumbnailPruneDeps {
    storage: Pick<IStorageAdapter, 'getPage' | 'listPageVersions'>;
    publish: Pick<IPublishAdapter, 'buildFileKey' | 'listFiles' | 'deleteFile'>;
}
