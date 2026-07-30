/**
 * Доменные ошибки storage-слоя.
 *
 * Адаптеры (дефолтный Postgres и кастомные реализации IStorageAdapter) кидают
 * эти классы вместо драйверных ошибок — ручки маппят их на HTTP-статусы с
 * машиночитаемым `data.code` (см. handlerHelpers, коды — PAGE_CONFLICT_CODES в
 * common/constants/publish.ts и BRICKS_API_ERROR_CODES в
 * common/constants/apiErrors.ts). Классы реэкспортируются из
 * `nuxt-bricks/persistence` для кастомных адаптеров.
 */

/**
 * Конфликт уникальности pagename: страница с таким именем уже существует.
 * Кидается из createPage/updatePage при нарушении unique-ограничения —
 * в том числе при гонке двух одновременных запросов (pre-check её не ловит).
 */
export class BricksPagenameConflictError extends Error {
    readonly pagename: string;

    constructor(pagename: string) {
        super(`Page with pagename "${pagename}" already exists`);
        this.name = 'BricksPagenameConflictError';
        this.pagename = pagename;
    }
}

/**
 * Конфликт optimistic locking: страница была изменена после того, как клиент
 * прочитал переданный `expectedRevision`. Кидается из updatePage, когда
 * precondition не совпал с текущей revision строки.
 */
export class BricksRevisionConflictError extends Error {
    readonly pageId: number;

    constructor(pageId: number) {
        super('Page was modified by another request (revision mismatch)');
        this.name = 'BricksRevisionConflictError';
        this.pageId = pageId;
    }
}

/**
 * Запрос остановлен серверным лимитом времени: база отменила его сама и
 * освободила соединение. Исход при этом ОПРЕДЕЛЁН — незавершённая запись
 * откатана, поэтому ручка отдаёт отказ, а не «исход неизвестен» клиентского
 * обрыва.
 *
 * Драйверная ошибка сохраняется в `cause`: наружу она не отдаётся (текст
 * PostgreSQL содержал бы детали SQL), но нужна в server-логе.
 */
export class BricksStatementTimeoutError extends Error {
    constructor(cause?: unknown) {
        super('Query was cancelled by the server statement timeout', { cause });
        this.name = 'BricksStatementTimeoutError';
    }
}
