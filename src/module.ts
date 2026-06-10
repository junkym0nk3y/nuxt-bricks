import {
    defineNuxtModule,
    createResolver,
    addPlugin,
    addLayout,
    addServerHandler,
    extendPages,
    installModule,
} from '@nuxt/kit';
import { defu } from 'defu';
import { brickWatchPlugin } from './runtime/utils/routing/vite-brick-watch';

// #region Types
export interface IBricksModuleOptions {
    /**
     * Basic Auth для защиты builder/preview и модифицирующих API.
     * ВНИМАНИЕ: задайте свои значения в production (см. README).
     */
    basicAuth?: {
        username?: string;
        password?: string;
    };
}
// #endregion

// #region Constants
const VITE_OPTIMIZE_INCLUDE = [
    'yup',
    '@vee-validate/yup',
    'tiny-case',
    'ajv',
    'natural-compare-lite',
    'json-source-map',
    'jmespath',
    'vanilla-jsoneditor',
    'json-editor-vue',
    '@vueuse/core',
    '@tiptap/vue-3',
    '@tiptap/starter-kit',
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
    },
    async setup(options, nuxt) {
        const { resolve } = createResolver(import.meta.url);
        const runtimeDir = resolve('./runtime');
        const isDev = nuxt.options.dev;

        // #region runtimeConfig
        const runtimeConfig = nuxt.options.runtimeConfig as Record<string, unknown>;
        runtimeConfig.basicAuthUsername =
            runtimeConfig.basicAuthUsername ??
            process.env.BASIC_AUTH_USERNAME ??
            options.basicAuth?.username;
        runtimeConfig.basicAuthPassword =
            runtimeConfig.basicAuthPassword ??
            process.env.BASIC_AUTH_PASSWORD ??
            options.basicAuth?.password;
        // #endregion

        // #region Experimental flags (нужны для defineRouteRules / appManifest)
        nuxt.options.experimental.appManifest = nuxt.options.experimental.appManifest ?? true;
        nuxt.options.experimental.inlineRouteRules =
            nuxt.options.experimental.inlineRouteRules ?? true;
        // #endregion

        // #region Зависимые модули
        await installModule('@pinia/nuxt');
        // #endregion

        // #region Стили
        nuxt.options.css.push(
            resolve(runtimeDir, 'assets/scss/bundle.scss'),
            resolve(runtimeDir, 'assets/scss/default.scss'),
            'swiper/css',
            'swiper/css/navigation',
            'swiper/css/pagination'
        );
        // #endregion

        // #region Vite (optimizeDeps + watch story-файлов)
        nuxt.options.vite = defu(nuxt.options.vite, {
            optimizeDeps: {
                include: VITE_OPTIMIZE_INCLUDE,
            },
        });
        if (isDev) {
            nuxt.options.vite.plugins = nuxt.options.vite.plugins || [];
            nuxt.options.vite.plugins.push(brickWatchPlugin(false));
        }
        // #endregion

        // #region Layout
        addLayout(
            {
                src: resolve(runtimeDir, 'layouts/landing.vue'),
                filename: 'landing.vue',
            },
            'landing'
        );
        // #endregion

        // #region Pages (builder + landing)
        extendPages((pages) => {
            pages.unshift(
                {
                    name: 'bricks-builder',
                    path: '/builder',
                    file: resolve(runtimeDir, 'builder/pages/builder.vue'),
                    children: [
                        {
                            name: 'bricks-builder-index',
                            path: '',
                            file: resolve(runtimeDir, 'builder/pages/index.vue'),
                        },
                        {
                            name: 'bricks-builder-pagename',
                            path: ':pagename',
                            file: resolve(runtimeDir, 'builder/pages/[pagename].vue'),
                        },
                    ],
                },
                {
                    name: 'bricks-landing-pagename',
                    path: '/landing/:pagename',
                    file: resolve(runtimeDir, 'render/pages/[pagename].vue'),
                }
            );
        });
        // #endregion

        // #region Plugins
        addPlugin(resolve(runtimeDir, 'plugins/vue-icons'));
        addPlugin(resolve(runtimeDir, 'plugins/vee-validate'));
        addPlugin(resolve(runtimeDir, 'plugins/text-editor-toolbar'));
        addPlugin(resolve(runtimeDir, 'plugins/landing-styles'));
        addPlugin(resolve(runtimeDir, 'plugins/landing-dynamic-routes'));
        addPlugin({
            src: resolve(runtimeDir, 'plugins/json-editor-vue.client'),
            mode: 'client',
        });
        // #endregion

        // #region Server (middleware + mock-api)
        addServerHandler({
            handler: resolve(runtimeDir, 'server/middleware/basic-auth'),
            middleware: true,
        });
        addServerHandler({
            handler: resolve(runtimeDir, 'server/middleware/proxy.client'),
            middleware: true,
        });
        addServerHandler({
            route: '/mock-api/s3-image',
            method: 'post',
            handler: resolve(runtimeDir, 'server/routes/mock-api/s3-image.post'),
        });
        addServerHandler({
            route: '/mock-api/s3-delete',
            method: 'post',
            handler: resolve(runtimeDir, 'server/routes/mock-api/s3-delete.post'),
        });
        addServerHandler({
            route: '/mock-api/landing-components',
            handler: resolve(runtimeDir, 'server/routes/mock-api/landing-components'),
        });
        // #endregion
    },
});
