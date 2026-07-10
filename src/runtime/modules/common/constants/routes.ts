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
    /** Страница логина database-auth (`<builderPrefix>/login`). */
    builderLogin: 'bricks-builder-login',
    /** Редактор страницы (`<builderPrefix>/:pagename`). */
    builderPage: 'bricks-builder-pagename',
    /** Превью рендера (`<previewPrefix>/:pagename`). */
    preview: 'bricks-preview',
    /** Live-рендер published-страницы (catch-all `/:pagename`). */
    page: 'bricks-page',
    /** Live-рендер с urlPrefix (catch-all `/:urlPrefix+/:pagename`). */
    pagePrefixed: 'bricks-page-prefixed',
} as const;
