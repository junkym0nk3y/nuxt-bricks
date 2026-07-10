/**
 * Доменные ошибки конфликтов storage-слоя.
 *
 * Адаптеры (дефолтный Postgres и кастомные реализации IStorageAdapter) кидают
 * эти классы вместо драйверных ошибок — ручки маппят их на HTTP 409 с
 * машиночитаемым `data.code` (см. handlerHelpers.toPageHttpError, коды —
 * PAGE_CONFLICT_CODES в common/constants/publish.ts). Классы реэкспортируются
 * из `nuxt-bricks/persistence` для кастомных адаптеров.
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
