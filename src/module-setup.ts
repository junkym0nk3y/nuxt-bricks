/**
 * Build-time helpers of the module setup (see src/module.ts): surface resolution
 * (prefixes plus feature flags), the builder Pinia/i18n, registration of pages
 * and server handlers. Moved out of module.ts and called only from its setup.
 */
import { addServerHandler, hasNuxtModule, installModule } from '@nuxt/kit';
import { defu } from 'defu';
import type { Nuxt, NuxtPage } from '@nuxt/schema';
import { BRICKS_LOCALES } from './runtime/modules/common/constants/locales';
import { PAGE_ROUTE_SEGMENT } from './runtime/modules/common/constants/publish';
import { BRICKS_ROUTE_NAMES } from './runtime/modules/common/constants/routes';
import {
    BUILDER_LOGIN_SEGMENT,
    DEFAULT_BRICKS_ROUTE_PREFIXES,
    validateBricksRoutePrefixes,
    type IBricksRoutePrefixes,
} from './runtime/modules/common/utils/bricks/routePaths';
import { BRICKS_API_HANDLERS } from './api-handlers';
import type { IBricksModuleOptions } from './types/module';
import type { IBricksRegistrationContext, IBricksSurfaces } from './types/moduleSetup';

/**
 * Prebundled by any deploy that renders a page at all, builder or render-only: the
 * slider block belongs to a published page and is reached without the builder ever
 * being built. Left in the builder-only list it cost the dev server a cold
 * re-optimize on the first page that carries a slider.
 */
const VITE_OPTIMIZE_INCLUDE_RENDER = [
    'swiper/vue',
    // js-xss is CommonJS only, and the sanitizer reaches it from the text, accordion and
    // SVG blocks. Imported from the module runtime inside node_modules it is never
    // discovered by the dev optimizer, so a consumer got it raw and the page died on
    // "does not provide an export named 'default'". The playground missed it: there
    // the runtime is project source, whose imports the optimizer does discover
    'xss',
];

/** Prebundled on a builder deploy alone: the dependencies of the builder UI */
const VITE_OPTIMIZE_INCLUDE_BUILDER = [
    'yup',
    'tiny-case',
    '@vueuse/core',
    '@tiptap/core',
    '@tiptap/vue-3',
    '@tiptap/starter-kit',
    '@tiptap/extension-image',
    '@tiptap/extension-underline',
    '@tiptap/extension-text-style',
    '@tiptap/extension-color',
    '@tiptap/extension-font-family',
    '@tiptap/extension-text-align',
    'markdown-it',
    '@tiptap/pm/state',
    '@tiptap/extension-document',
    '@tiptap/extension-paragraph',
    '@tiptap/extension-text',
    '@tiptap/extension-hard-break',
];

/**
 * Assembles the Vite prebundle list for the active surfaces.
 *
 * An empty list when both surfaces are off: the module then renders no page at
 * all, and a dependency of a block nobody mounts would be prebundled for a deploy
 * that never reaches it.
 *
 * @param surfaces - Active surfaces.
 * @returns Dependencies to prebundle, empty when nothing is rendered.
 */
export function resolveViteOptimizeInclude(surfaces: IBricksSurfaces): string[] {
    const { isBuilderEnabled, arePublishedPagesEnabled } = surfaces;

    return [
        ...(isBuilderEnabled || arePublishedPagesEnabled ? VITE_OPTIMIZE_INCLUDE_RENDER : []),
        ...(isBuilderEnabled ? VITE_OPTIMIZE_INCLUDE_BUILDER : []),
    ];
}

/**
 * Resolves the module surfaces from the options: prefixes (fail-fast validation)
 * and feature flags; logs the deviations from the defaults.
 *
 * @param options - Module options from nuxt.config.
 * @returns Active surfaces.
 */
export function resolveBricksSurfaces(options: IBricksModuleOptions): IBricksSurfaces {
    const routePrefixes: IBricksRoutePrefixes = {
        builderPrefix: options.routes?.builderPrefix ?? DEFAULT_BRICKS_ROUTE_PREFIXES.builderPrefix,
        previewPrefix: options.routes?.previewPrefix ?? DEFAULT_BRICKS_ROUTE_PREFIXES.previewPrefix,
    };
    validateBricksRoutePrefixes(routePrefixes);

    const surfaces: IBricksSurfaces = {
        routePrefixes,
        isBuilderEnabled: options.features?.builder !== false,
        arePublishedPagesEnabled: options.features?.publishedPages !== false,
    };

    logBricksSurfaces(surfaces);

    return surfaces;
}

/**
 * Logs a non-default surface configuration at module start.
 *
 * @param surfaces - Active surfaces.
 */
function logBricksSurfaces(surfaces: IBricksSurfaces): void {
    const { routePrefixes, isBuilderEnabled, arePublishedPagesEnabled } = surfaces;

    if (routePrefixes.builderPrefix !== DEFAULT_BRICKS_ROUTE_PREFIXES.builderPrefix) {
        console.info(`[nuxt-bricks] Builder prefix: ${routePrefixes.builderPrefix}`);
    }

    if (routePrefixes.previewPrefix !== DEFAULT_BRICKS_ROUTE_PREFIXES.previewPrefix) {
        console.info(`[nuxt-bricks] Preview prefix: ${routePrefixes.previewPrefix}`);
    }

    if (!isBuilderEnabled) {
        console.info(
            '[nuxt-bricks] Builder UI disabled (features.builder: false) — render-only mode'
        );
    }

    if (!arePublishedPagesEnabled) {
        console.info(
            '[nuxt-bricks] Published catch-all routes disabled (features.publishedPages: false)'
        );
    }
}

/**
 * Installs the dependencies of the builder surface: Pinia and i18n (the ru/en
 * translations). Neither render nor published pages use them — so it is called
 * only when features.builder is on.
 *
 * @param nuxt - Nuxt instance.
 * @param options - Module options.
 * @param localesDir - Absolute path to runtime/locales.
 */
export async function setupBricksBuilderModules(
    nuxt: Nuxt,
    options: IBricksModuleOptions,
    localesDir: string
): Promise<void> {
    // Fail-fast on a wrong module order: if @nuxtjs/i18n is already installed, its
    // setup read the options BEFORE the bricks defaults were applied (strategy
    // no_prefix and the rest) — the builder routes get rewritten or renamed and
    // answer 404. Verified with a live build: a warning is not enough, routing
    // breaks.
    if (hasNuxtModule('@nuxtjs/i18n')) {
        throw new Error(
            '[nuxt-bricks] @nuxtjs/i18n is installed before nuxt-bricks — builder routes would break. Place nuxt-bricks BEFORE @nuxtjs/i18n in nuxt.config modules (bricks applies safe i18n defaults and registers its translations).'
        );
    }

    if (!hasNuxtModule('@pinia/nuxt')) {
        await installModule('@pinia/nuxt');
    }

    // Subscribe BEFORE installModule: @nuxtjs/i18n calls the hook inside its own
    // setup.
    let isI18nRegistered = false;
    nuxt.hook('i18n:registerModule', (register) => {
        isI18nRegistered = true;
        register({
            langDir: localesDir,
            locales: BRICKS_LOCALES,
        });
    });

    // The defaults are applied before i18n is installed (defu: the consumer
    // options from nuxt.options.i18n win) — a bare prefix_except_default strategy
    // would rewrite the routes and the dashboard would answer 404.
    // The default locale follows the one that wins the merge, not the bricks option
    // alone: a consumer who set the top-level i18n.defaultLocale and left bricks.i18n
    // untouched keeps their locale.
    //
    // The browser-language detection of i18n is off. It runs on every route of the
    // application and writes its cookie into every SSR response, so the published pages
    // of the host went out with a `Set-Cookie` and a proxy cache in front of them stopped
    // caching any HTML. The builder applies its language itself, on its own routes
    // (plugins/builder-locale).
    const defaultLocale = nuxt.options.i18n?.defaultLocale ?? options.i18n?.defaultLocale ?? 'ru';
    nuxt.options.i18n = defu(nuxt.options.i18n, {
        strategy: 'no_prefix' as const,
        defaultLocale,
        detectBrowserLanguage: false as const,
    });

    // The hasNuxtModule above guarantees that i18n is not installed yet
    await installModule('@nuxtjs/i18n');

    // app:resolve comes after modules:done: @nuxtjs/i18n calls
    // i18n:registerModule from its own modules:done hook, which — when the
    // consumer installs i18n explicitly — is registered later than the bricks
    // hooks. Without translations the builder UI shows raw keys, and that is
    // always a configuration mistake, so we fail the build.
    nuxt.hook('app:resolve', () => {
        if (!isI18nRegistered) {
            throw new Error(
                '[nuxt-bricks] i18n:registerModule hook was not called — builder translations are missing. Place nuxt-bricks BEFORE @nuxtjs/i18n in nuxt.config modules.'
            );
        }
    });
}

/**
 * Registers the module pages (as the extendPages callback): the builder plus
 * preview (features.builder) and the static live-render catch-alls
 * (features.publishedPages); the paths come from bricks.routes.
 *
 * @param pages - Array of Nuxt pages.
 * @param context - Registration context.
 */
export function registerBricksPages(pages: NuxtPage[], context: IBricksRegistrationContext): void {
    const { resolve, runtimeDir, surfaces } = context;
    const { routePrefixes, isBuilderEnabled, arePublishedPagesEnabled } = surfaces;

    // One page per pair of address routes (prefixed and not): they differ only in
    // the shape of the path, their behavior is the same
    const builderPageFile = resolve(runtimeDir, 'modules/builder/app/pages/[pagename].vue');
    const renderPageFile = resolve(runtimeDir, 'modules/render/pages/[pagename].vue');

    if (isBuilderEnabled) {
        pages.unshift(
            {
                name: BRICKS_ROUTE_NAMES.builderRoot,
                path: routePrefixes.builderPrefix,
                file: resolve(runtimeDir, 'modules/builder/app/pages/builder.vue'),
                children: [
                    {
                        name: BRICKS_ROUTE_NAMES.builderIndex,
                        path: '',
                        file: resolve(runtimeDir, 'modules/builder/publish/pages/index.vue'),
                    },
                    {
                        // A static segment beats :pagename in the vue-router
                        // ranking whatever the order, which is why the segment
                        // sits in the `bricks-` namespace: otherwise the editor of
                        // a consumer page named `/login` would be unreachable. In
                        // basic mode the page redirects to the builder dashboard.
                        name: BRICKS_ROUTE_NAMES.builderLogin,
                        path: BUILDER_LOGIN_SEGMENT,
                        file: resolve(runtimeDir, 'modules/builder/auth/pages/login.vue'),
                    },
                    {
                        name: BRICKS_ROUTE_NAMES.builderPage,
                        path: `:pagename(${PAGE_ROUTE_SEGMENT})`,
                        file: builderPageFile,
                    },
                    {
                        // The editor address repeats the page address: a name is
                        // unique only inside its own prefix, and the editors of
                        // `/blog/post` and `/news/post` have to differ.
                        //
                        // A separate entry rather than `:urlPrefix*` in the
                        // previous one: a repeatable parameter cannot be made
                        // optional without losing the ranking against the static
                        // children of the prefix — `:urlPrefix*` matches an empty
                        // rest too, so it would intercept
                        // `<builderPrefix>/bricks-login` and the login page along
                        // with it. The regex segments narrow the interception down
                        // to valid addresses.
                        name: BRICKS_ROUTE_NAMES.builderPagePrefixed,
                        path: `:urlPrefix(${PAGE_ROUTE_SEGMENT})+/:pagename(${PAGE_ROUTE_SEGMENT})`,
                        file: builderPageFile,
                    },
                ],
            },
            {
                // Preview mode is determined by the route name (bricks-preview,
                // bricks-preview-prefixed); the ?preview=true query is not used.
                name: BRICKS_ROUTE_NAMES.preview,
                path: `${routePrefixes.previewPrefix}/:pagename(${PAGE_ROUTE_SEGMENT})`,
                file: renderPageFile,
            },
            {
                // Preview is opened from the editor of a particular page, so its
                // address is full as well: by name alone the "Preview" button of
                // `/news/post` would open a tab the builder then fills with the
                // schema of `/blog/post`
                name: BRICKS_ROUTE_NAMES.previewPrefixed,
                path: `${routePrefixes.previewPrefix}/:urlPrefix(${PAGE_ROUTE_SEGMENT})+/:pagename(${PAGE_ROUTE_SEGMENT})`,
                file: renderPageFile,
            }
        );
    }

    // The live render of published pages is two static catch-all routes instead of
    // route-per-page: a route-per-page registration had to load the whole
    // published list on every SSR and had no SPA invalidation.
    // The page is resolved by a direct lookup in the bricks-page-layout
    // middleware; the regex segments narrow the interception down to valid
    // pagename/urlPrefix values.
    // Static consumer routes always win the vue-router ranking; a root-level
    // dynamic consumer route without a custom regex (pages/[slug].vue) loses —
    // documented in the README.
    if (arePublishedPagesEnabled) {
        pages.push(
            {
                name: BRICKS_ROUTE_NAMES.page,
                path: `/:pagename(${PAGE_ROUTE_SEGMENT})`,
                file: renderPageFile,
                meta: { isPublishedBricksPage: true },
            },
            {
                name: BRICKS_ROUTE_NAMES.pagePrefixed,
                path: `/:urlPrefix(${PAGE_ROUTE_SEGMENT})+/:pagename(${PAGE_ROUTE_SEGMENT})`,
                file: renderPageFile,
                meta: { isPublishedBricksPage: true },
            }
        );
    }
}

/**
 * Registers the /api/bricks/** server handlers from the BRICKS_API_HANDLERS
 * manifest (persistence, auth, health plus the builder surface: component
 * library, media proxy, page thumbnail).
 * Render-only mode keeps only the handlers flagged `isPublic` — the editorial
 * CRUD, the auth and the builder handlers are not needed without the builder UI
 * (a narrower surface).
 *
 * /api/bricks/** is always served by local handlers; the data backend underneath
 * them is chosen by bricks.backend.mode (builtin PostgreSQL vs external HTTP, see
 * module-backend-config.ts). devProxy (dev-only) never touches bricks paths.
 *
 * @param context - Registration context.
 */
export function registerBricksServerHandlers(context: IBricksRegistrationContext): void {
    const { resolve, runtimeDir, surfaces } = context;
    const { isBuilderEnabled } = surfaces;

    for (const { route, method, file, isPublic } of BRICKS_API_HANDLERS) {
        if (!isBuilderEnabled && !isPublic) {
            continue;
        }

        addServerHandler({
            route,
            method,
            handler: resolve(runtimeDir, file),
        });
    }
}

// The modules whose chunks a published page never needs: the editor stack
// (TipTap/ProseMirror), the builder documentation and all the builder/text-editor
// code, plus the two icon chunks. `deviceIcons` is not builder-only — the preview
// banner needs it too — but no published page renders a device glyph, and both
// surfaces that do await the chunk explicitly through a route gate rather than
// leaning on a prefetch hint. Swiper is not among them: a page with a slider needs
// its chunk right away (SSR fallback → hydration), and a page without a slider
// does not render it anyway.
const NON_PUBLISHED_CHUNK_PATTERN =
    /@tiptap|prosemirror|markdown-it|\/modules\/(builder|text-editor)\/|\/docs\/guide\/|\/plugins\/builder\/|\/plugins\/icons\/(builderIcons|deviceIcons)/;

/**
 * Turns `<link rel="prefetch">` off for the chunks a published page never needs.
 * Vite puts prefetch
 * hints on the dynamic imports of rendered modules, so a visitor of a published
 * page would download the whole editor stack while idle (the TipTap inline-editing
 * chain through BlockText, for one). Entries are flagged by the pattern, plus the
 * transitive closure of their static imports (hash-named vendor chunks cannot be
 * attributed otherwise); a chunk reachable by static imports from an unflagged
 * entry stays prefetchable (shared vendor). `preload` is left alone — hydration of
 * the chunks that are actually used needs it.
 *
 * @param nuxt - Nuxt instance.
 */
export function disableNonPublishedChunkPrefetch(nuxt: Nuxt): void {
    nuxt.hook('build:manifest', (manifest) => {
        const flagged = new Set(
            Object.keys(manifest).filter((key) => NON_PUBLISHED_CHUNK_PATTERN.test(key))
        );

        // The closure of the STATIC imports of the flagged entries. dynamicImports
        // are not walked: through an entry chunk they would reach every lazy chunk
        // of the application (the consumer chunks and the Nuxt error page
        // included).
        const stack = [...flagged];
        while (stack.length > 0) {
            const key = stack.pop() as string;
            for (const dep of manifest[key]?.imports ?? []) {
                if (!flagged.has(dep)) {
                    flagged.add(dep);
                    stack.push(dep);
                }
            }
        }

        // Chunks reachable by static imports from unflagged entries stay
        // prefetchable — they are needed outside the builder too
        const shared = new Set<string>();
        for (const key of Object.keys(manifest)) {
            if (flagged.has(key)) {
                continue;
            }
            const walk = [key];
            while (walk.length > 0) {
                const current = walk.pop() as string;
                if (shared.has(current)) {
                    continue;
                }
                shared.add(current);
                walk.push(...(manifest[current]?.imports ?? []));
            }
        }

        for (const key of flagged) {
            if (!shared.has(key) && manifest[key]) {
                manifest[key].prefetch = false;
            }
        }
    });
}
