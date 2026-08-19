/**
 * Контракты persistence-слоя: данные страниц, медиа и файловое хранилище.
 *
 * IStorageAdapter — CRUD страниц и медиа-метаданных (дефолт — Postgres).
 * IPublishAdapter — файловое хранилище публикации (дефолт — S3/Yandex).
 *
 * Контракт учёток (`IAuthAdapter`) живёт в `authAdapters.d.ts`: он не может
 * уехать во внешний backend, у него другие потребители и другая причина
 * меняться.
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
import type {
    IBricksTemplateRow,
    ICreateTemplatePayload,
    IUpdateTemplatePayload,
    TBricksTemplateSummary,
} from '../../common/types/templates';
import type { IBricksPageAddress } from '../../common/types/pageAddress';

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
    /**
     * Сводки шаблонов страниц (без `schema` и `pageMeta`, с числом блоков) —
     * новые сверху, по дате СОЗДАНИЯ: переименование шаблона не должно
     * перебрасывать его карточку в начало сетки.
     */
    listTemplates(): Promise<TBricksTemplateSummary[]>;
    /** Полный шаблон со схемой и оформлением; `null` — шаблона нет. */
    getTemplate(id: number): Promise<IBricksTemplateRow | null>;
    /**
     * Создаёт шаблон и возвращает его полностью.
     *
     * Контракт отказа: занятое имя — `BricksTemplateNameConflictError` (в том
     * числе на гонке двух одновременных создателей: pre-check её не ловит).
     * Идемпотентности здесь НЕТ и быть не должно — повторный POST с тем же
     * именем означает вторую попытку человека, и молчаливый ответ «уже есть»
     * выдал бы чужой шаблон за только что сохранённый.
     *
     * `thumbnailUrl` приходит уже собственным файлом шаблона: копию кадра
     * страницы делает ручка, потому что ссылка на кадр страницы не переживает
     * её следующего сохранения (уборка `prunePageThumbnails` о шаблонах не знает).
     */
    createTemplate(payload: ICreateTemplatePayload): Promise<IBricksTemplateRow>;
    /**
     * Правит подпись шаблона (имя и/или описание); `null` — шаблона нет.
     * Занятое имя — `BricksTemplateNameConflictError`.
     */
    updateTemplate(id: number, payload: IUpdateTemplatePayload): Promise<IBricksTemplateRow | null>;
    /**
     * Удаляет шаблон; `null` — шаблона нет (ручка отвечает 404), иначе — URL его
     * файла превью, который остался без ссылки.
     *
     * Результат несёт `thumbnailUrl`, а не `boolean`: файл превью убирает ручка,
     * и без URL из этого же запроса ей пришлось бы читать строку заранее — то
     * есть гонка «двое удаляют один шаблон» оставила бы файл в хранилище
     * навсегда. `thumbnailUrl: null` — убирать нечего.
     */
    deleteTemplate(id: number): Promise<TDeleteTemplateResult>;
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
 * Итог удаления шаблона. `null` — шаблона с таким id нет; иначе — URL файла
 * превью удалённой записи (`null` внутри — превью не было).
 */
export type TDeleteTemplateResult = { thumbnailUrl: string | null } | null;

/**
 * Половина контракта хранилища, отвечающая за шаблоны страниц.
 *
 * Собирается отдельным файлом и подмешивается спредом — по той же причине, что
 * и медиа-половина: у страниц и шаблонов нет общих запросов, а вместе файл
 * адаптера перерос бы потолок в 500 строк. Имя одно на две реализации
 * (Postgres и HTTP), чтобы набор методов у них не разъехался.
 */
export type TStorageTemplateMethods = Pick<
    IStorageAdapter,
    'listTemplates' | 'getTemplate' | 'createTemplate' | 'updateTemplate' | 'deleteTemplate'
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
 *
 * `avatar` — фото профиля. Отдельный namespace, а не медиатека: попади аватары
 * в галерею, любой редактор увидел бы их среди рабочих файлов и мог удалить
 * чужое фото, а импорт бакета зарегистрировал бы их как медиа.
 */
export type TPublishFileKind = 'media' | 'thumbnail' | 'avatar';

/**
 * Файловое хранилище публикации (медиа-файлы).
 *
 * Managed namespace: адаптер владеет ограниченным набором префиксов ключей
 * (для S3-дефолта — `prefix`, `thumbnailsPrefix` и `avatarsPrefix`
 * конфигурации). Все ключи строятся через `buildFileKey`, а
 * `deleteFile`/`isOwnedUrl` обязаны отказывать ключам вне namespace — в
 * shared-бакете модуль не должен уметь трогать посторонние объекты даже по
 * синтаксически валидному URL бакета.
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
