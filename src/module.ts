import { existsSync } from 'node:fs';
import {
    defineNuxtModule,
    createResolver,
    addPlugin,
    addLayout,
    addRouteMiddleware,
    addServerHandler,
    addServerPlugin,
    extendPages,
} from '@nuxt/kit';
import { defu } from 'defu';
import type { ViteDevServer } from 'vite';
// Side-effect type import: pulls in the augmentation of NuxtOptions.i18n and of
// the i18n:registerModule hook
import type {} from '@nuxtjs/i18n';
import {
    BRICKS_MANIFEST_TEMP_SUFFIX,
    createBricksManifestQueue,
    isBrickFilePath,
    resolveBricksManifestDir,
} from './bricks-manifest';
import { BRICKS_MANIFEST_ASSET_BASE } from './runtime/modules/common/constants/brickManifest';
import { BRICKS_PUBLIC_ASSETS_BASE } from './runtime/modules/common/utils/bricks/assetPaths';
import { DEFAULT_BRICKS_ROUTE_PREFIXES } from './runtime/modules/common/utils/bricks/routePaths';
import {
    disableBuilderChunkPrefetch,
    registerBricksPages,
    registerBricksServerHandlers,
    resolveBricksSurfaces,
    setupBricksBuilderModules,
} from './module-setup';
import { applyBricksRuntimeConfig, resolveBricksDevices } from './module-runtime-config';
import { resolveBricksMixinsPath, setupBricksScss } from './module-scss';
import type { IBricksModuleOptions } from './types/module';
import type { IBricksRegistrationContext } from './types/moduleSetup';

// The module options are part of the public package API (`export *` in
// dist/types.d.mts)
export type { IBricksModuleOptions };

// #region Constants
const VITE_OPTIMIZE_INCLUDE = [
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
    'swiper/vue',
    '@tiptap/extension-document',
    '@tiptap/extension-paragraph',
    '@tiptap/extension-text',
    '@tiptap/extension-hard-break',
];
// #endregion

export default defineNuxtModule<IBricksModuleOptions>({
    meta: {
        name: 'nuxt-bricks',
        configKey: 'bricks',
        compatibility: {
            nuxt: '>=3.21.0',
        },
    },
    defaults: {
        basicAuth: {
            username: 'admin',
            password: 'change-me',
        },
        auth: {
            mode: 'basic',
            sessionMaxAgeSeconds: 604800,
        },
        versionsLimit: 5,
        routes: DEFAULT_BRICKS_ROUTE_PREFIXES,
        features: {
            builder: true,
            publishedPages: true,
        },
    },
    async setup(options, nuxt) {
        const { resolve } = createResolver(import.meta.url);
        const runtimeDir = resolve('./runtime');
        const isDev = nuxt.options.dev;

        // #region Routes and feature flags (fail-fast prefix validation)
        const surfaces = resolveBricksSurfaces(options);
        const { isBuilderEnabled, arePublishedPagesEnabled } = surfaces;
        const registrationContext: IBricksRegistrationContext = {
            resolve,
            runtimeDir,
            surfaces,
        };
        // #endregion

        // #region runtimeConfig + fail-fast backend.mode
        const runtimeConfig = nuxt.options.runtimeConfig as Record<string, unknown>;
        const backendResolution = applyBricksRuntimeConfig(
            runtimeConfig,
            options,
            surfaces.routePrefixes,
            surfaces.arePublishedPagesEnabled
        );
        // An invalid backend configuration (database auth + external) fails the
        // build right away — there will be no silently broken production
        if (backendResolution.errors.length > 0) {
            throw new Error(`[nuxt-bricks] ${backendResolution.errors.join('\n\n')}`);
        }
        // What carries the resolved mode is the registration of Nitro plugins
        // rather than runtimeConfig: a NUXT_ env variable cannot switch the mode
        // bypassing the build-time validation (the registry takes its default
        // factory from the plugin)
        if (backendResolution.mode === 'external') {
            addServerPlugin(resolve(runtimeDir, 'server/plugins/externalBackendStorage'));
        }
        // #endregion

        // #region Public assets (block previews, placeholders, doc images)
        // A dedicated /_bricks/ prefix instead of the root: the builder assets do
        // not mix with the consumer `public/`, and the client URLs are built by
        // resolveBricksAssetUrl (which accounts for app.baseURL). The assets are
        // needed by the builder surface alone.
        if (isBuilderEnabled) {
            nuxt.hook('nitro:config', (nitroConfig) => {
                nitroConfig.publicAssets = nitroConfig.publicAssets || [];
                nitroConfig.publicAssets.push({
                    baseURL: BRICKS_PUBLIC_ASSETS_BASE,
                    dir: resolve(runtimeDir, 'public'),
                    maxAge: 60 * 60 * 24 * 7,
                });
            });
        }
        // #endregion

        // #region Experimental flags (what defineRouteRules and appManifest need)
        nuxt.options.experimental.appManifest = nuxt.options.experimental.appManifest ?? true;
        nuxt.options.experimental.inlineRouteRules =
            nuxt.options.experimental.inlineRouteRules ?? true;
        // #endregion

        // #region Dependency modules + i18n (builder surface only)
        // Neither render nor published pages use Pinia or vue-i18n — in render-only
        // mode the host application gets no modules it does not need.
        // Inside: fail-fast on a wrong module order (@nuxtjs/i18n before bricks).
        if (isBuilderEnabled) {
            await setupBricksBuilderModules(nuxt, options, resolve(runtimeDir, 'locales'));
        }

        // The prefetch hints of builder-only chunks must not download the editor
        // stack for visitors of published pages (see
        // disableBuilderChunkPrefetch).
        disableBuilderChunkPrefetch(nuxt);
        // #endregion

        // #region Styles
        // Only the module's own scoped styles (variables/transitions/fonts plus the
        // reset under body.bricks-page). The Swiper CSS is imported by
        // BlockSlider.vue into its own chunk.
        // From src the `.scss` files are used; in the built package mkdist compiles
        // them into `.css` (the consumer needs no sass) — so we take whichever
        // extension exists.
        // fonts is a separate entry rather than a `@use` inside bundle.scss: sass
        // does not rebase url() on @use, so the woff2 path would be resolved
        // against bundle.scss and break in the built package. Kept on its own, the
        // url() stays correct relative to the file that spells it out, both in src
        // and in dist.
        for (const stylesheet of ['bundle', 'default', 'common/fonts']) {
            const scssPath = resolve(runtimeDir, `assets/scss/${stylesheet}.scss`);
            nuxt.options.css.push(
                existsSync(scssPath)
                    ? scssPath
                    : resolve(runtimeDir, `assets/scss/${stylesheet}.css`)
            );
        }
        // #endregion

        // #region Public SCSS API
        // Why the map goes through a buildDir file and an alias, and why there is no
        // automatic prepend — the header of module-scss.ts
        setupBricksScss(
            nuxt,
            resolveBricksDevices(options.devices),
            resolveBricksMixinsPath(runtimeDir)
        );
        // #endregion

        // #region Vite (optimizeDeps)
        // The prebundle list is the dependencies of the builder UI; render-only
        // does not need it
        if (isBuilderEnabled) {
            nuxt.options.vite = defu(nuxt.options.vite, {
                optimizeDeps: {
                    include: VITE_OPTIMIZE_INCLUDE,
                },
            });
        }
        // #endregion

        // #region Brick component manifest and the dev watcher
        const manifestDir = resolveBricksManifestDir(nuxt.options.buildDir);
        // One queue per Nuxt instance: build:before and the dev watcher must not
        // scan in parallel
        const manifestQueue = createBricksManifestQueue({
            srcDir: nuxt.options.srcDir,
            manifestDir,
        });
        // An unfinished scan of the old instance is awaited here: close is called
        // before the build:before of the new one (@nuxt/cli, DevServer#load)
        nuxt.hook('close', () => manifestQueue.dispose());

        // The client Vite server: a brick-file parse error is shown through it as
        // an overlay on top of the page
        let viteClientServer: ViteDevServer | undefined;

        /**
         * Shows a manifest generation error to the developer: a line in the
         * terminal plus a Vite overlay on top of the page when the dev server is
         * already up. The overlay clears itself — the next successful generation
         * sends a reload.
         *
         * @param context - What exactly failed (a watcher event or the build).
         * @param error - The generation error.
         */
        function reportManifestFailure(context: string, error: unknown): void {
            const message = error instanceof Error ? error.message : String(error);

            console.error(`[nuxt-bricks] ${context} failed: ${message}`);
            viteClientServer?.hot.send({
                type: 'error',
                err: { message, stack: error instanceof Error ? (error.stack ?? '') : '' },
            });
        }

        // The manifest itself is only needed by the builder: it is the only reader
        // of the component library, while the renderer takes brickPath straight
        // from the page schema.
        if (isBuilderEnabled) {
            // build:before rather than setup: nuxi build/prepare wipe buildDir
            // between the module setup and the build, so a write from setup
            // would be erased.
            nuxt.hook('build:before', async () => {
                try {
                    await manifestQueue.enqueue();
                } catch (error) {
                    // In a build the error has to be fatal: production must not
                    // silently ship without a manifest. In dev it is the other way
                    // round: a brick file is edited against a live server, and a
                    // file that fails to parse must not take the loading of the
                    // instance down with it. The previous manifest stays on disk,
                    // the editor keeps working on it, and the cause is visible to
                    // the developer. Otherwise any restart started before the file
                    // is fixed would leave the editor unreachable.
                    if (!isDev) {
                        throw error;
                    }

                    reportManifestFailure('generation of the brick component manifest', error);
                }
            });

            // The manifest reaches Nitro as a server asset: in dev the directory
            // is mounted by the fs driver (so add/unlink stay fresh), in prod the
            // contents are baked into the server bundle — the components handler
            // does not depend on process.cwd() and works from a single .output.
            // `ignore` is about the temporary files of an atomic publish: nitro
            // passes it both to the globby of the prod bake and to the dev fs
            // driver, so a half-written manifest.json.<pid>.<n>.tmp never enters
            // the namespace
            nuxt.hook('nitro:config', (nitroConfig) => {
                nitroConfig.serverAssets = nitroConfig.serverAssets || [];
                nitroConfig.serverAssets.push({
                    baseName: BRICKS_MANIFEST_ASSET_BASE,
                    dir: manifestDir,
                    ignore: [`**/*${BRICKS_MANIFEST_TEMP_SUFFIX}`],
                });
            });
        }

        // The dev watcher of brick files sits on the standard Nuxt hook. The set of
        // files the `import.meta.glob` in useBrickImports matches is expanded by
        // Vite at transform time — on add/unlink only a restart can rebuild the
        // loader map, and Nuxt has the `restart` hook for exactly that (Nuxt calls
        // it the same way itself — for structurally significant files and for the
        // creation of the components directory). A restart runs `build:before`
        // too, so the manifest is regenerated without our help.
        // The loader map is read by more than the builder: the published renderer
        // pulls brick modules through the same glob, so both surfaces need the
        // restart.
        if (isDev && (isBuilderEnabled || arePublishedPagesEnabled)) {
            nuxt.hook('vite:serverCreated', (server, env) => {
                // The client server is the one whose hot channel the browser
                // listens to
                if (env.isClient) {
                    viteClientServer = server;
                }
            });

            nuxt.hook('builder:watch', async (event, path) => {
                if (!isBrickFilePath(nuxt.options.srcDir, path)) {
                    return;
                }

                // Nuxt calls the hook without await, so any rejection from here
                // goes into an unhandled promise, and Node with the default
                // --unhandled-rejections=throw kills the dev server over it
                try {
                    // The set the glob matches changed — only a restart helps, and
                    // it runs unconditionally. A trial scan before it would give
                    // nothing: the "a restart is still needed" state would have to
                    // be kept between instances, and a restart is precisely what
                    // creates a new instance of the module — the new instance has
                    // no such state to read. Instead, a file that fails to parse
                    // does not break `build:before` in dev.
                    if (event === 'add' || event === 'unlink') {
                        await nuxt.callHook('restart');

                        return;
                    }

                    // change: the set is the same, but the metadata may have
                    // changed — that is about the manifest, hence about the builder
                    // alone
                    if (event !== 'change' || !isBuilderEnabled) {
                        return;
                    }

                    await manifestQueue.enqueue();

                    // The brick metadata is cached in
                    // useAsyncData('bricks-components') — a targeted HMR is not
                    // enough here
                    viteClientServer?.hot.send({ type: 'full-reload' });
                } catch (error) {
                    reportManifestFailure(`the ${event} event of the brick file ${path}`, error);
                }
            });
        }
        // #endregion

        // #region Layout
        addLayout(
            {
                src: resolve(runtimeDir, 'layouts/bricks.vue'),
                filename: 'bricks.vue',
            },
            'bricks'
        );
        // #endregion

        // #region Pages
        // builder + preview by features.builder, the published catch-all by
        // features.publishedPages; the paths come from bricks.routes
        extendPages((pages) => {
            registerBricksPages(pages, registrationContext);
        });
        // #endregion

        // #region Route middleware (layout + data loading of published pages)
        addRouteMiddleware({
            name: 'bricks-page-layout',
            path: resolve(runtimeDir, 'middleware/bricks-page-layout.global'),
            global: true,
        });
        // #endregion

        // #region Plugins
        // vue-icons (BricksIcon plus the icon core) and bricks-styles are needed by
        // published pages too; vee-validate and text-editor-toolbar belong to the
        // builder UI alone (and are lazily gated by runOnBuilderRoute anyway).
        addPlugin(resolve(runtimeDir, 'plugins/vue-icons'));
        addPlugin(resolve(runtimeDir, 'plugins/bricks-styles'));
        if (isBuilderEnabled) {
            addPlugin(resolve(runtimeDir, 'plugins/vee-validate'));
            addPlugin(resolve(runtimeDir, 'plugins/text-editor-toolbar'));
        }
        // #endregion

        // #region Server (middleware + api/bricks)
        addServerHandler({
            handler: resolve(runtimeDir, 'server/middleware/auth'),
            middleware: true,
        });
        // devProxy is dev-build only: it proxies non-bricks /api/* to PROXY_URL
        // (the host API of the project); in production the middleware does not
        // exist
        if (isDev) {
            addServerHandler({
                handler: resolve(runtimeDir, 'server/middleware/devProxy'),
                middleware: true,
            });
        }
        // /api/bricks comes from the BRICKS_API_HANDLERS manifest (render-only
        // keeps the public read-model)
        registerBricksServerHandlers(registrationContext);
        // #endregion
    },
});
