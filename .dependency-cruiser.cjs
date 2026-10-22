/**
 * Layering rules for the domains of src/runtime/modules/. This file is the ground truth
 * for the allowed directions: the rules below are what a check runs against, and the
 * comment next to a rule is why it is shaped the way it is.
 *
 * The domains: builder/{app,core,shell,canvas,publish,documentation,media,users,auth,
 * templates}, text-editor, render, layouts-blocks, persistence, ui, common. builder/app
 * is the composition root and carries no restriction of its own beyond the global rules.
 */
const M = 'src/runtime/modules';

module.exports = {
    forbidden: [
        {
            name: 'no-circular',
            severity: 'error',
            from: {},
            to: {
                circular: true,
                // legitimate recursion of the Vue components of the canvas tree:
                // BuilderCanvasItem ↔ BuilderCanvasItemLayout,
                // BuilderCanvasItem ↔ BuilderCanvasItemComponent
                viaNot: `^${M}/builder/canvas/item/components/BuilderCanvasItem(Layout|Component)\\.vue$`,
            },
        },
        {
            name: 'common-is-bottom',
            severity: 'error',
            from: { path: `^${M}/common` },
            to: { path: `^${M}/(?!common)` },
        },
        {
            name: 'ui-is-bottom',
            severity: 'error',
            from: { path: `^${M}/ui` },
            to: { path: `^${M}/(?!ui|common)` },
        },
        {
            // render is self-contained: common plus layouts-blocks only, nothing from builder
            name: 'render-lean',
            severity: 'error',
            from: { path: `^${M}/render` },
            to: { path: `^${M}/(?!render|common|layouts-blocks)` },
        },
        {
            // the blocks know nothing about builder; the viewport arrives through
            // inject(CANVAS_VIEWPORT_KEY)
            name: 'layouts-blocks-deps',
            severity: 'error',
            from: { path: `^${M}/layouts-blocks` },
            to: { path: `^${M}/(?!layouts-blocks|common|ui|text-editor)` },
        },
        {
            name: 'text-editor-deps',
            severity: 'error',
            from: { path: `^${M}/text-editor` },
            to: { path: `^${M}/(?!text-editor|common|ui)` },
        },
        {
            // the state core knows nothing about the feature subdomains — otherwise a
            // canvas↔shell cycle. There is no exception: the former way out into the
            // composition root (the properties panel reaching the modal facade) left
            // together with the facade itself — the modal cache is filled by the component
            // library, and the panel reads it from core
            name: 'builder-core-deps',
            severity: 'error',
            from: { path: `^${M}/builder/core` },
            to: { path: `^${M}/(?!builder/core|common|ui|layouts-blocks)` },
        },
        {
            // canvas/shell → core/publish/media/auth plus text-editor/layouts-blocks/ui/
            // common; not into each other and not into the composition root (app).
            //
            // auth is allowed since the avatar appeared in the builder toolbar: the profile
            // menu is a single component for both surfaces (the dashboard header and the
            // toolbar), and wiring it into the toolbar is possible either this way or
            // through a slot from the composition root — that is, by two different
            // mechanisms for one component. This creates no cycle by construction: auth
            // itself is limited to `auth|ui|common` (see `builder-auth-deps`), so no way
            // back from it into shell exists. `core` must not be added to this list — that
            // is exactly where a canvas↔shell cycle would appear.
            name: 'builder-canvas-shell-deps',
            severity: 'error',
            from: { path: `^${M}/builder/(canvas|shell)` },
            to: {
                path: `^${M}/(?!builder/(canvas|shell|core|publish|media|auth)|text-editor|layouts-blocks|ui|common)`,
            },
        },
        {
            name: 'builder-canvas-shell-no-cross',
            severity: 'error',
            from: { path: `^${M}/builder/canvas` },
            to: { path: `^${M}/builder/shell` },
        },
        {
            name: 'builder-shell-no-canvas',
            severity: 'error',
            from: { path: `^${M}/builder/shell` },
            to: { path: `^${M}/builder/canvas` },
        },
        {
            // the /bricks dashboard (publish/pages/index.vue) is the hosting surface: it
            // renders the documentation and media gallery modals, which is why media and
            // documentation are allowed. `builder/users` is the "Users" section of the same
            // dashboard: it lives as a subdomain of its own (managing accounts is not
            // publishing), while the dashboard stays its host. `builder/templates` is the
            // same: the "Templates" section plus the template choice in the page creation
            // form, and the pair has a single direction (publish → templates)
            name: 'builder-publish-deps',
            severity: 'error',
            from: { path: `^${M}/builder/publish` },
            to: {
                path: `^${M}/(?!builder/publish|builder/core|builder/media|builder/documentation|builder/auth|builder/users|builder/templates|ui|common)`,
            },
        },
        {
            // users is the accounts section of the dashboard: it reads the permissions from
            // core and takes everything else from the kit and common. `auth` is NOT on the
            // list deliberately: an own profile and other people's accounts are different
            // things, and the profile modal (an own password from an own row) is opened by
            // the host on an event. `publish` likewise: the section knows neither about the
            // pages nor about the dashboard — otherwise a publish↔users cycle would appear
            name: 'builder-users-deps',
            severity: 'error',
            from: { path: `^${M}/builder/users` },
            to: { path: `^${M}/(?!builder/users|builder/core|ui|common)` },
        },
        {
            // templates is the templates section of the dashboard: it reads the permissions
            // from core and takes everything else from the kit and common. `publish` is NOT
            // on the list: a page out of a template is created by the form of the publishing
            // domain, and knowing about it here would give a publish↔templates cycle. The
            // schema of the source page is assembled by the caller and passed by value
            name: 'builder-templates-deps',
            severity: 'error',
            from: { path: `^${M}/builder/templates` },
            to: { path: `^${M}/(?!builder/templates|builder/core|ui|common)` },
        },
        {
            // auth is a small self-contained subdomain (the login page, the session)
            name: 'builder-auth-deps',
            severity: 'error',
            from: { path: `^${M}/builder/auth` },
            to: { path: `^${M}/(?!builder/auth|ui|common)` },
        },
        {
            name: 'builder-media-deps',
            severity: 'error',
            from: { path: `^${M}/builder/media` },
            to: { path: `^${M}/(?!builder/media|builder/core|ui|common)` },
        },
        {
            name: 'builder-documentation-deps',
            severity: 'error',
            from: { path: `^${M}/builder/documentation` },
            to: { path: `^${M}/(?!builder/documentation|ui|common)` },
        },
        {
            // the server adapters: used from src/runtime/server/api/bricks/** alone
            name: 'persistence-is-server-only',
            severity: 'error',
            from: { path: `^${M}/(?!persistence)` },
            to: { path: `^${M}/persistence` },
        },
        {
            name: 'persistence-deps',
            severity: 'error',
            from: { path: `^${M}/persistence` },
            to: { path: `^${M}/(?!persistence|common)` },
        },
    ],
    options: {
        doNotFollow: { path: 'node_modules' },
        // the contract types are part of the graph: count type-only imports too
        tsPreCompilationDeps: true,
        tsConfig: { fileName: 'tsconfig.json' },
        enhancedResolveOptions: {
            exportsFields: ['exports'],
            conditionNames: ['import', 'require', 'node', 'default', 'types'],
            extensions: ['.ts', '.mts', '.d.ts', '.js', '.mjs', '.vue'],
        },
        reporterOptions: {
            text: { highlightFocused: true },
        },
    },
};
