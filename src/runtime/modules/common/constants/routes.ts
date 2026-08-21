/**
 * Names of the routes the module registers (module.ts → extendPages).
 *
 * The names are a stable contract: the paths depend on `bricks.routes`
 * (builderPrefix/previewPrefix) and on `app.baseURL`, the names do not. Internal
 * navigation goes by name (`router.push({ name })`); hardcoded path strings are
 * forbidden (see `common/utils/bricks/routePaths.ts`).
 */
export const BRICKS_ROUTE_NAMES = {
    /** Parent route of the builder (`<builderPrefix>`) */
    builderRoot: 'bricks-builder',
    /** Dashboard of the pages manager (the index child of builderRoot) */
    builderIndex: 'bricks-builder-index',
    /** Login page of database auth (`<builderPrefix>/bricks-login`) */
    builderLogin: 'bricks-builder-login',
    /** Page editor without a prefix (`<builderPrefix>/:pagename`) */
    builderPage: 'bricks-builder-pagename',
    /** Page editor with a urlPrefix (`<builderPrefix>/:urlPrefix+/:pagename`) */
    builderPagePrefixed: 'bricks-builder-pagename-prefixed',
    /** Render preview without a prefix (`<previewPrefix>/:pagename`) */
    preview: 'bricks-preview',
    /** Render preview with a urlPrefix (`<previewPrefix>/:urlPrefix+/:pagename`) */
    previewPrefixed: 'bricks-preview-prefixed',
    /** Live render of a published page (the catch-all `/:pagename`) */
    page: 'bricks-page',
    /** Live render with a urlPrefix (the catch-all `/:urlPrefix+/:pagename`) */
    pagePrefixed: 'bricks-page-prefixed',
} as const;

/**
 * Routes of the page editor. There are two of them rather than one with an optional
 * parameter, because a repeatable parameter cannot be made optional without losing
 * the ranking against the static children of the prefix (the login page):
 * `:urlPrefix*` matches an empty remainder too, that is, it would intercept
 * `<builderPrefix>/bricks-login`.
 */
export const BRICKS_BUILDER_PAGE_ROUTE_NAMES: readonly string[] = [
    BRICKS_ROUTE_NAMES.builderPage,
    BRICKS_ROUTE_NAMES.builderPagePrefixed,
];

/** Routes of the render preview (with and without an address prefix) */
export const BRICKS_PREVIEW_ROUTE_NAMES: readonly string[] = [
    BRICKS_ROUTE_NAMES.preview,
    BRICKS_ROUTE_NAMES.previewPrefixed,
];
