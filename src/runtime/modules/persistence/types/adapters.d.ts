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
import type { IMediaCategory, IMediaItem } from '../../common/types/media';
import type { IBricksPageAddress } from '../../common/types/pageAddress';
import type { TBricksUserRole } from '../../common/types/auth';

/**
 * Данные для создания записи медиа (id и uploadedAt генерирует хранилище).
 */
export interface ICreateMediaPayload {
    url: string;
    filename: string;
    size: number;
    mimeType: string;
    category: string | null;
    svgContent?: string | null;
    alt?: string;
    uploadedAt?: string;
    /** Пиксельные размеры растра; не передаются для svg и видео. */
    width?: number | null;
    height?: number | null;
    /** URL уменьшенных вариантов постепенной загрузки; null — вариантов нет. */
    previewUrl?: string | null;
    mockUrl?: string | null;
}

/**
 * Частичное обновление метаданных медиа.
 */
export type TUpdateMediaPayload = Partial<Pick<IMediaItem, 'filename' | 'alt' | 'category'>>;

/**
 * Данные для создания категории медиа. `slug` считает вызывающий (из подписи),
 * а не хранилище: тот же slug нужен ему для ответа об уже существующей категории.
 */
export interface ICreateMediaCategoryPayload {
    slug: string;
    label: string;
}

/**
 * Итог удаления категории. `null` — категории с таким slug нет (ручка отвечает
 * 404); иначе — у скольких файлов категория снята.
 */
export type TDeleteMediaCategoryResult = { clearedCount: number } | null;

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
     * Контракт версионирования: если в payload присутствует `schema` либо
     * `viewportConfig` (обе — части версионируемого состояния страницы) и лимит
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
     * URL (гонка импорта из бакета, ретрай клиента, повтор после неизвестного
     * исхода) обязана вернуть уже существующую запись, а не падать и не
     * создавать дубликат.
     *
     * Контракт отказа: если адаптер ЗНАЕТ, что запись не применена, он кидает
     * `BricksStorageWriteRejectedError` (или наследника — например,
     * `BricksUnknownMediaCategoryError` для отсутствующей категории). Любая
     * другая ошибка означает неизвестный исход, и вызывающий не станет удалять
     * уже загруженные файлы — иначе в БД осталась бы строка, указывающая на
     * удалённый объект.
     */
    createMedia(payload: ICreateMediaPayload): Promise<IMediaItem>;
    /**
     * Обновляет метаданные медиа; null — записи с таким id нет.
     *
     * Отсутствующая в payload'е категория — `BricksUnknownMediaCategoryError`
     * (тот же контракт отказа, что у createMedia).
     */
    updateMedia(id: number, payload: TUpdateMediaPayload): Promise<IMediaItem | null>;
    deleteMedia(id: number): Promise<boolean>;
    /** Категории медиатеки в порядке показа (по sortOrder, затем id). */
    listMediaCategories(): Promise<IMediaCategory[]>;
    /**
     * Создаёт категорию.
     *
     * Контракт идемпотентности: `slug` уникален; повторное создание того же
     * slug'а обязано вернуть существующую запись, а не падать — иначе двойной
     * клик по «подтвердить» показывал бы ошибку на успешно созданной категории.
     * Отличать «создали» от «уже была» вызывающему не нужно: обе ветки приводят
     * к одному состоянию UI.
     */
    createMediaCategory(payload: ICreateMediaCategoryPayload): Promise<IMediaCategory>;
    /**
     * Удаляет категорию, сняв её с файлов.
     *
     * Обе половины обязаны быть атомарны: между снятием категории и удалением
     * записи нельзя допустить состояние, в котором `bricks_media.category`
     * ссылается в пустоту (чего не позволит FK). Предустановленных и
     * неудаляемых категорий нет — удалить можно любую, файлы при этом остаются
     * в медиатеке и видны в фильтре «Все».
     */
    deleteMediaCategory(slug: string): Promise<TDeleteMediaCategoryResult>;
}

/**
 * Медиа-половина контракта хранилища.
 *
 * Оба адаптера (Postgres и HTTP) собирают её отдельным файлом и подмешивают в
 * свой контракт спредом; набор методов у них обязан совпадать, поэтому имя
 * одно и живёт здесь, а не двумя копиями в реализациях.
 */
export type TStorageMediaMethods = Pick<
    IStorageAdapter,
    | 'listMedia'
    | 'getMedia'
    | 'getMediaByUrl'
    | 'createMedia'
    | 'updateMedia'
    | 'deleteMedia'
    | 'listMediaCategories'
    | 'createMediaCategory'
    | 'deleteMediaCategory'
>;

/**
 * Доступ к списку категорий — всё, что нужно правилам продукта из
 * `server/utils/mediaCategoryRules.ts`. Узкий Pick, чтобы правила тестировались
 * юнитами без реального Postgres.
 */
export type TMediaCategoryStorage = Pick<IStorageAdapter, 'listMediaCategories'>;

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
    /**
     * Кладёт файл в хранилище под уже построенным ключом.
     *
     * Успех возвращает публичный URL. При отказе адаптер обязан best-effort
     * удалить объект по этому ключу и пробросить ИСХОДНУЮ ошибку: отказ
     * отправки не доказывает, что объекта нет — ответ мог потеряться или
     * упереться в таймаут уже после записи, и тогда объект остался бы без
     * ссылки навсегда (вызывающий URL не получил и удалять ему нечего).
     * Отсутствие объекта при этом не гарантируется: если и уборка отказала,
     * остаётся невидимый мусор — это дешевле, чем потерянная ошибка загрузки.
     *
     * Ключ обязан быть НОВЫМ: перезапись существующего объекта этой ручкой не
     * поддерживается, иначе компенсация снесла бы живой файл.
     */
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
    role: TBricksUserRole;
    /**
     * Поколение учётных данных на момент чтения. Вход обязан передать его в
     * `createSession`: проверка пароля занимает секунды (scrypt), и за это
     * время учётку могли деактивировать или сменить ей пароль.
     */
    authVersion: number;
}

/**
 * Пользователь авторизованной сессии (без секретов — уходит в event.context и клиенту).
 */
export interface IAuthSessionUser {
    id: number;
    username: string;
    isActive: boolean;
    /**
     * Актуальная роль, а не снимок на момент входа: гард ручек читает её на
     * каждом запросе, поэтому понижение прав действует со следующего запроса
     * без ожидания истечения куки.
     */
    role: TBricksUserRole;
    /** Отображаемое имя профиля; null — показывается логин. */
    displayName: string | null;
    /** Ссылка на фото профиля; null — буквенная заглушка. */
    avatarUrl: string | null;
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
 * Учётка в списке управления пользователями (без секретов и без
 * `auth_version`: поколение — деталь механизма отзыва, наружу ей незачем).
 */
export interface IAuthUserSummary {
    id: number;
    username: string;
    role: TBricksUserRole;
    isActive: boolean;
    displayName: string | null;
    avatarUrl: string | null;
    /** ISO 8601 UTC — момент создания учётки. */
    createdAt: string;
}

/**
 * Данные создания учётки администратором. Хеш пароля считает ручка
 * (`server/utils/auth/passwords.ts`) — адаптер паролей в открытом виде не
 * видит вовсе, поэтому не может ни залогировать их, ни отправить наружу.
 */
export interface ICreateAuthUserPayload {
    username: string;
    passwordHash: string;
    role: TBricksUserRole;
}

/**
 * Правка состояния чужой учётки: роль и/или активность. `undefined` — поле не
 * передано и сохраняет текущее значение.
 *
 * Оба поля в одном контракте, а не двумя методами, потому что применяться они
 * обязаны одной транзакцией: разбей их на пару вызовов — и отказ второго оставил
 * бы строку в состоянии, которого клиент не просил, не сообщив, какая половина
 * прошла. Заодно краевое правило про последнего администратора проверяется по
 * ИТОГОВОМУ состоянию, а не по каждому полю отдельно.
 *
 * Имя и фото профиля здесь отсутствуют намеренно: их правит себе сам человек,
 * администратору доступны только права, активность, пароль и удаление. Логин
 * неизменяем вовсе — переименование ломало бы ссылки на автора и журналы.
 */
export interface IAuthUserStateChange {
    role?: TBricksUserRole;
    isActive?: boolean;
}

/**
 * Состояние учётки, от которого зависят краевые правила
 * (`server/utils/authUserRules.ts`): роль и активность. Читается под
 * блокировкой строки и сравнивается с итоговым состоянием.
 */
export interface IAuthUserStateSnapshot {
    role: TBricksUserRole;
    isActive: boolean;
}

/**
 * Данные для создания cookie-сессии (в БД хранится только SHA-256 токена).
 */
export interface ICreateAuthSessionPayload {
    tokenHash: string;
    userId: number;
    expiresAt: Date;
    /**
     * Поколение учётных данных, прочитанное ПЕРЕД проверкой пароля. Сессия
     * создаётся, только если оно всё ещё актуально и учётка активна.
     */
    expectedAuthVersion: number;
}

/**
 * Хранилище пользователей и cookie-сессий database-auth (дефолт — Postgres).
 *
 * Требование к свежести, обязательное для любой реализации (в том числе
 * внешней — HTTP-backend, OIDC): `getSessionWithUser` обязан отдавать
 * АКТУАЛЬНЫЕ `role`, `isActive` и профиль, а не снимок на момент входа, и
 * обязан считать сессию отсутствующей, если поколение учётных данных
 * разошлось с сохранённым при входе. На этом держится отзыв прав: смена
 * пароля, деактивация и смена роли действуют со следующего запроса, а не
 * через семь суток жизни куки. Реализация, кеширующая роль или носящая её в
 * самоподписанном токене без проверки, контракт нарушает.
 */
export interface IAuthAdapter {
    getUserByUsername(username: string): Promise<IAuthUserRecord | null>;
    /**
     * Возвращает только непросроченную сессию активного пользователя с
     * актуальным поколением учётных данных (всё остальное неотличимо от
     * отсутствующей сессии).
     */
    getSessionWithUser(tokenHash: string): Promise<IAuthSessionWithUser | null>;
    /**
     * Создаёт сессию, если учётка всё ещё активна и её поколение совпадает с
     * `expectedAuthVersion`.
     *
     * @returns false — состояние учётки изменилось между проверкой пароля и
     * вставкой (сменили пароль, деактивировали, сменили роль); куку в этом
     * случае выставлять нельзя.
     */
    createSession(payload: ICreateAuthSessionPayload): Promise<boolean>;
    deleteSession(tokenHash: string): Promise<void>;
    /** Удаляет просроченные сессии; возвращает количество удалённых. */
    deleteExpiredSessions(): Promise<number>;
    /** Sliding-продление: обновляет expires_at и last_used_at. */
    touchSession(tokenHash: string, expiresAt: Date): Promise<void>;
    /** Все учётки для раздела управления, в стабильном порядке (по id). */
    listUsers(): Promise<IAuthUserSummary[]>;
    /**
     * Создаёт учётку.
     *
     * @throws BricksUsernameTakenError - Логин занят (сравнение
     * регистронезависимое — как и вход).
     */
    createUser(payload: ICreateAuthUserPayload): Promise<IAuthUserSummary>;
    /**
     * Меняет роль и/или активность учётки одной транзакцией и отзывает её
     * сессии: украденная кука иначе получила бы новые полномочия при повышении,
     * а понижение действовало бы только со следующего входа. Правка, не
     * меняющая состояние, сессии не рвёт.
     *
     * @returns Новое состояние строки; null — учётки нет.
     * @throws BricksLastActiveAdminError - Итоговое состояние оставило бы
     * систему без активного администратора.
     */
    updateUserState(userId: number, change: IAuthUserStateChange): Promise<IAuthUserSummary | null>;
    /**
     * Ставит новый хеш пароля и отзывает сессии учётки.
     *
     * @returns Состояние строки; null — учётки нет.
     */
    updateUserPassword(userId: number, passwordHash: string): Promise<IAuthUserSummary | null>;
    /**
     * Удаляет учётку (сессии уходят каскадом FK).
     *
     * @returns false — учётки нет.
     * @throws BricksLastActiveAdminError - Удаление оставило бы систему без
     * активного администратора.
     */
    deleteUser(userId: number): Promise<boolean>;
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
