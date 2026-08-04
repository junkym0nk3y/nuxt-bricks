/**
 * Имена роутов, регистрируемых модулем (module.ts → extendPages).
 *
 * Имена — стабильный контракт: пути зависят от `bricks.routes`
 * (builderPrefix/previewPrefix) и `app.baseURL`, имена — нет. Внутренние
 * переходы делать по именам (`router.push({ name })`), захардкоженные
 * строки-пути запрещены (см. `common/utils/bricks/routePaths.ts`).
 */
export const BRICKS_ROUTE_NAMES = {
    /** Родительский роут билдера (`<builderPrefix>`). */
    builderRoot: 'bricks-builder',
    /** Дашборд менеджера страниц (index-ребёнок builderRoot). */
    builderIndex: 'bricks-builder-index',
    /** Страница логина database-auth (`<builderPrefix>/bricks-login`). */
    builderLogin: 'bricks-builder-login',
    /** Редактор страницы без префикса (`<builderPrefix>/:pagename`). */
    builderPage: 'bricks-builder-pagename',
    /** Редактор страницы с urlPrefix (`<builderPrefix>/:urlPrefix+/:pagename`). */
    builderPagePrefixed: 'bricks-builder-pagename-prefixed',
    /** Превью рендера без префикса (`<previewPrefix>/:pagename`). */
    preview: 'bricks-preview',
    /** Превью рендера с urlPrefix (`<previewPrefix>/:urlPrefix+/:pagename`). */
    previewPrefixed: 'bricks-preview-prefixed',
    /** Live-рендер published-страницы (catch-all `/:pagename`). */
    page: 'bricks-page',
    /** Live-рендер с urlPrefix (catch-all `/:urlPrefix+/:pagename`). */
    pagePrefixed: 'bricks-page-prefixed',
} as const;

/**
 * Маршруты редактора страницы. Их два, а не один с опциональным параметром,
 * потому что repeatable-параметр опциональным сделать нельзя, не проиграв
 * ранжирование статическим детям префикса (страница логина): `:urlPrefix*`
 * матчит и пустой остаток, то есть перехватывал бы `<builderPrefix>/bricks-login`.
 */
export const BRICKS_BUILDER_PAGE_ROUTE_NAMES: readonly string[] = [
    BRICKS_ROUTE_NAMES.builderPage,
    BRICKS_ROUTE_NAMES.builderPagePrefixed,
];

/** Маршруты превью рендера (с префиксом адреса и без). */
export const BRICKS_PREVIEW_ROUTE_NAMES: readonly string[] = [
    BRICKS_ROUTE_NAMES.preview,
    BRICKS_ROUTE_NAMES.previewPrefixed,
];
