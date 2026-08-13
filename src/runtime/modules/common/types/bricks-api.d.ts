import type { IBricksSchema } from './brick';
import type { TBricksPageDeviceSet } from './devices';

/**
 * Общая форма ошибки API/fetch/БД: покрывает createError (h3), FetchError (ofetch, `data`)
 * и драйверные ошибки с `code` (pg). Все поля опциональны — реальная ошибка может быть любой.
 */
export interface IApiError {
    statusCode?: number;
    statusMessage?: string;
    message?: string;
    code?: string;
    data?: { message?: string };
}

/**
 * Формат данных для фронтенда.
 * БД возвращает snake_case, но Vue автоматически конвертирует в camelCase.
 */
export interface IBricksPageRow {
    id: number;
    pagename: string;
    title: string | null;
    description: string | null;
    keywords: string | null;
    backgroundColor: string | null;
    layout: string | null;
    socialImage: string | null;
    urlPrefix: string | null;
    subdomain: string | null;
    thumbnailUrl: string | null;
    /**
     * Свой набор устройств страницы; `null` — страница наследует набор проекта.
     *
     * Ширина устройства служит и листом канваса, и `min-width` его диапазона
     * media-query, поэтому набор — единственный источник раскладки страницы.
     * Семантика `null` важна для истории: восстановленная версия наследующей
     * страницы покажет ТЕКУЩИЙ набор проекта, а не тот, что был на момент снимка.
     */
    viewportConfig: TBricksPageDeviceSet | null;
    schema: IBricksSchema;
    published: boolean;
    /** Монотонный счётчик изменений строки — precondition optimistic locking. */
    revision: number;
    createdAt: string;
    updatedAt: string;
}

/**
 * Сводка строки страницы для editorial-списка (`GET /api/bricks`) — без JSONB
 * `schema`. Полная строка отдаётся только point-lookup'ом `GET /api/bricks/:id`.
 */
export type TBricksPageSummaryRow = Omit<IBricksPageRow, 'schema'>;

/**
 * Формат данных для фронтенда (плоская структура без settings).
 */
export interface IPublishedPage {
    id: number;
    pagename: string;
    title: string | null;
    description: string | null;
    keywords: string | null;
    backgroundColor: string | null;
    layout: string | null;
    socialImage: string | null;
    urlPrefix: string | null;
    subdomain: string | null;
    thumbnailUrl: string | null;
    /**
     * Свой набор устройств страницы; `null` — страница наследует набор проекта.
     *
     * Ширина устройства служит и листом канваса, и `min-width` его диапазона
     * media-query, поэтому набор — единственный источник раскладки страницы.
     * Семантика `null` важна для истории: восстановленная версия наследующей
     * страницы покажет ТЕКУЩИЙ набор проекта, а не тот, что был на момент снимка.
     */
    viewportConfig: TBricksPageDeviceSet | null;
    schema: IBricksSchema;
    published: boolean;
    /**
     * Revision editorial-строки для optimistic locking. Опциональна только
     * потому, что публичная проекция (`/api/bricks/public/**`) поле не отдаёт;
     * editorial-записи без revision не пишутся (`requirePageRevision`).
     */
    revision?: number;
    createdAt: string;
    updatedAt: string;
    isPreview?: boolean;
}

/**
 * Клиентская сводка страницы (editorial-список без `schema`): meta, routing,
 * `thumbnailUrl` и `revision` — всё, что нужно дашборду и precondition'ам.
 * Схему редактор и дублирование получают point-lookup'ом `GET /api/bricks/:id`.
 */
export type TPublishedPageSummary = Omit<IPublishedPage, 'schema' | 'isPreview'>;

/**
 * Снапшот страницы для превью в localStorage (`bricks-preview-page`).
 * `storedAt` — момент записи; превью сравнивает его с `updatedAt` из БД,
 * чтобы устаревший снапшот не перетирал свежие сохранённые данные.
 *
 * Хранит только состояние КАНВАСА (его в БД нет). Превью сохранённой версии
 * этот слот не использует: версия уходит в `?version=` превью-роута и приезжает
 * с сервера — иначе открытый рядом билдер перетирал бы снимок версии живой
 * схемой, а второе превью — снимком другой версии.
 */
export interface IPreviewStoredPage extends IPublishedPage {
    storedAt?: string;
}

/**
 * Сводка сохранённой версии страницы (лёгкий список без schema).
 *
 * `thumbnailUrl` — снимок канваса того состояния, которое унесла версия;
 * `null` у версий, созданных до появления снимков у истории (и у тех, чей
 * снимок не доехал: съёмка превью — fire-and-forget).
 *
 * Две даты — не дубль: `createdAt` — момент снапшота, то есть момент, когда
 * состояние **вытеснили**; `pageUpdatedAt` (updated_at исходной строки на
 * момент снапшота) — момент, когда его **сохранили**. Пользователю показывают
 * вторую: она описывает то, что на снимке.
 */
export interface IPageVersionSummary {
    id: number;
    pageId: number;
    thumbnailUrl: string | null;
    pageUpdatedAt: string | null;
    createdAt: string;
}

/**
 * Полный снапшот версии страницы: meta + schema на момент сохранения.
 */
export interface IPageVersion extends IPageVersionSummary {
    pagename: string;
    title: string | null;
    description: string | null;
    keywords: string | null;
    socialImage: string | null;
    layout: string | null;
    backgroundColor: string | null;
    urlPrefix: string | null;
    subdomain: string | null;
    /**
     * Свой набор устройств страницы; `null` — страница наследует набор проекта.
     *
     * Ширина устройства служит и листом канваса, и `min-width` его диапазона
     * media-query, поэтому набор — единственный источник раскладки страницы.
     * Семантика `null` важна для истории: восстановленная версия наследующей
     * страницы покажет ТЕКУЩИЙ набор проекта, а не тот, что был на момент снимка.
     */
    viewportConfig: TBricksPageDeviceSet | null;
    schema: IBricksSchema;
    published: boolean;
}

export interface ICreatePagePayload {
    pagename: string;
    title?: string | null;
    description?: string | null;
    keywords?: string | null;
    socialImage?: string | null;
    layout?: string | null;
    backgroundColor?: string | null;
    urlPrefix?: string | null;
    subdomain?: string | null;
    viewportConfig?: TBricksPageDeviceSet | null;
    schema: IBricksSchema;
    published?: boolean;
}

export interface IUpdatePagePayload {
    pagename?: string;
    title?: string;
    description?: string;
    keywords?: string;
    socialImage?: string | null;
    layout?: string | null;
    backgroundColor?: string | null;
    urlPrefix?: string | null;
    subdomain?: string | null;
    viewportConfig?: TBricksPageDeviceSet | null;
    thumbnailUrl?: string | null;
    schema?: IBricksSchema;
    published?: boolean;
    /**
     * Precondition optimistic locking (НЕ записываемое поле): ожидаемая клиентом
     * revision строки. При несовпадении с текущей адаптер обязан кинуть
     * BricksRevisionConflictError (409), ничего не меняя. Без поля — запись
     * без precondition (last-write-wins).
     */
    expectedRevision?: number;
}

/**
 * Данные формы публикации (без schema).
 * `thumbnailUrl` исключён: поле машинное (пишется только PATCH'ем после снапшота канваса),
 * форма/duplicate его не трогают — так PUT полной страницы не затирает превью.
 */
export type TPublishFormState = Omit<
    IPublishedPage,
    'id' | 'schema' | 'isPreview' | 'thumbnailUrl'
>;

export type TRequestErrorLike = {
    data?: {
        message?: string;
        code?: string | number;
        statusCode?: number;
    };
    message?: string;
    code?: string | number;
    statusCode?: number;
};
