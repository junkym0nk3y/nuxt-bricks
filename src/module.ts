import {
    defineNuxtModule,
    createResolver,
    addPlugin,
    addLayout,
    addRouteMiddleware,
    addServerHandler,
    extendPages,
    installModule,
    hasNuxtModule,
} from '@nuxt/kit';
import { defu } from 'defu';
// Side-effect type import: подтягивает augmentation NuxtOptions.i18n и хука i18n:registerModule
import type {} from '@nuxtjs/i18n';
import { brickWatchPlugin } from './runtime/modules/common/utils/routing/vite-brick-watch';

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
    /**
     * PostgreSQL для дефолтного storage-адаптера (persistence).
     * Если url задан — /api/bricks/** обслуживаются локальными Nitro-ручками.
     * ENV-переопределение: NUXT_BRICKS_DATABASE_URL (legacy: DATABASE_URL).
     */
    database?: {
        url?: string;
    };
    /**
     * S3-совместимое хранилище для дефолтного publish-адаптера.
     * ENV-переопределение: NUXT_BRICKS_S3_* (legacy: YANDEX_STORAGE_*).
     */
    s3?: {
        endpoint?: string;
        region?: string;
        bucket?: string;
        accessKeyId?: string;
        secretAccessKey?: string;
        prefix?: string;
    };
    /**
     * Проксирование /api/* на внешний backend (dev-режим / свой REST API).
     * Если database.url не задан, /api/bricks/** тоже уходят на прокси.
     */
    proxy?: {
        url?: string;
    };
    /**
     * Локализация интерфейса билдера (ru/en).
     * defaultLocale применяется, только если @nuxtjs/i18n ставит сам bricks
     * (у потребителя модуль не подключён).
     */
    i18n?: {
        defaultLocale?: 'ru' | 'en';
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

// #region Helpers
/**
 * Логирует выбранный persistence-режим при старте модуля.
 *
 * @param hasDatabase - Сконфигурирована ли локальная БД.
 * @param hasProxy - Задан ли PROXY_URL.
 */
function logPersistenceMode(hasDatabase: boolean, hasProxy: boolean): void {
    if (hasDatabase) {
        console.info('[nuxt-bricks] Persistence: local PostgreSQL adapter (/api/bricks/**)');
        return;
    }

    if (hasProxy) {
        console.info('[nuxt-bricks] Persistence: proxy mode (/api/* → PROXY_URL)');
        return;
    }

    console.warn(
        '[nuxt-bricks] Neither bricks.database.url nor PROXY_URL is configured — /api/bricks/** will fail at runtime'
    );
}

/**
 * Заполняет runtimeConfig модуля: basic-auth, persistence (Postgres/S3), proxy.
 * Дефолты переопределяемы в production через ENV (NUXT_BRICKS_*, legacy-имена — fallback).
 *
 * @param runtimeConfig - nuxt.options.runtimeConfig.
 * @param options - Опции модуля из nuxt.config.
 */
function applyBricksRuntimeConfig(
    runtimeConfig: Record<string, unknown>,
    options: IBricksModuleOptions
): void {
    runtimeConfig.basicAuthUsername =
        runtimeConfig.basicAuthUsername ??
        process.env.BASIC_AUTH_USERNAME ??
        options.basicAuth?.username;
    runtimeConfig.basicAuthPassword =
        runtimeConfig.basicAuthPassword ??
        process.env.BASIC_AUTH_PASSWORD ??
        options.basicAuth?.password;

    // Persistence: PostgreSQL (server-only, секреты не в public)
    runtimeConfig.bricksDatabaseUrl =
        runtimeConfig.bricksDatabaseUrl ?? options.database?.url ?? process.env.DATABASE_URL ?? '';

    // Persistence: S3-хранилище (server-only)
    runtimeConfig.bricksS3 = defu(runtimeConfig.bricksS3 as object | undefined, options.s3, {
        endpoint: 'https://storage.yandexcloud.net',
        region: 'ru-central1',
        bucket: process.env.YANDEX_STORAGE_BUCKET_NAME ?? '',
        accessKeyId: process.env.YANDEX_STORAGE_ACCESS_KEY_ID ?? '',
        secretAccessKey: process.env.YANDEX_STORAGE_SECRET_ACCESS_KEY ?? '',
        prefix: 'bricks-media/',
    });

    // Proxy-режим: /api/* → внешний backend
    const publicConfig = (runtimeConfig.public ?? {}) as Record<string, unknown>;
    runtimeConfig.public = publicConfig;
    publicConfig.PROXY_URL =
        publicConfig.PROXY_URL ?? options.proxy?.url ?? process.env.PROXY_URL ?? '';

    logPersistenceMode(Boolean(runtimeConfig.bricksDatabaseUrl), Boolean(publicConfig.PROXY_URL));
}
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
        applyBricksRuntimeConfig(runtimeConfig, options);
        // #endregion

        // #region Public assets (превью layout-блоков, плейсхолдеры, картинки документации)
        nuxt.hook('nitro:config', (nitroConfig) => {
            nitroConfig.publicAssets = nitroConfig.publicAssets || [];
            nitroConfig.publicAssets.push({
                dir: resolve(runtimeDir, 'public'),
                maxAge: 60 * 60 * 24 * 7,
            });
        });
        // #endregion

        // #region Experimental flags (нужны для defineRouteRules / appManifest)
        nuxt.options.experimental.appManifest = nuxt.options.experimental.appManifest ?? true;
        nuxt.options.experimental.inlineRouteRules =
            nuxt.options.experimental.inlineRouteRules ?? true;
        // #endregion

        // #region Зависимые модули
        await installModule('@pinia/nuxt');
        // #endregion

        // #region i18n (переводы билдера ru/en)
        // Подписка ДО installModule: @nuxtjs/i18n вызывает хук в своём setup.
        let isI18nRegistered = false;
        nuxt.hook('i18n:registerModule', (register) => {
            isI18nRegistered = true;
            register({
                langDir: resolve(runtimeDir, 'locales'),
                locales: [
                    { code: 'ru', language: 'ru-RU', file: 'ru.json' },
                    { code: 'en', language: 'en-US', file: 'en.json' },
                ],
            });
        });

        // Дефолты применяются всегда (defu: опции потребителя побеждают) — если
        // потребитель подключил @nuxtjs/i18n сам без конфига, голая стратегия
        // prefix_except_default переписала бы маршруты и /bricks отдавал бы 404.
        const defaultLocale = options.i18n?.defaultLocale ?? 'ru';
        nuxt.options.i18n = defu(nuxt.options.i18n, {
            strategy: 'no_prefix' as const,
            defaultLocale,
            detectBrowserLanguage: {
                useCookie: true,
                cookieKey: 'bricks-locale',
                fallbackLocale: defaultLocale,
            },
        });

        if (!hasNuxtModule('@nuxtjs/i18n')) {
            await installModule('@nuxtjs/i18n');
        }

        // app:resolve — после modules:done: @nuxtjs/i18n вызывает i18n:registerModule
        // из собственного modules:done-хука, который при явном подключении i18n
        // потребителем регистрируется позже bricks-хуков.
        nuxt.hook('app:resolve', () => {
            if (!isI18nRegistered) {
                console.warn(
                    '[nuxt-bricks] i18n:registerModule hook was not called — builder translations are missing. Place nuxt-bricks BEFORE @nuxtjs/i18n in nuxt.config modules.'
                );
            }
        });
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

        // #region Vite (optimizeDeps + watch brick-файлов)
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
                src: resolve(runtimeDir, 'layouts/bricks.vue'),
                filename: 'bricks.vue',
            },
            'bricks'
        );
        // #endregion

        // #region Pages (builder + published page)
        extendPages((pages) => {
            pages.unshift(
                {
                    name: 'bricks-builder',
                    path: '/bricks',
                    file: resolve(runtimeDir, 'modules/builder/app/pages/builder.vue'),
                    children: [
                        {
                            name: 'bricks-builder-index',
                            path: '',
                            file: resolve(runtimeDir, 'modules/builder/publish/pages/index.vue'),
                        },
                        {
                            name: 'bricks-builder-pagename',
                            path: ':pagename',
                            file: resolve(runtimeDir, 'modules/builder/app/pages/[pagename].vue'),
                        },
                    ],
                },
                {
                    // Превью-режим определяется именем этого роута (bricks-preview),
                    // query ?preview=true больше не используется. Live-рендер published —
                    // только динамические ЧПУ маршруты (plugins/bricks-dynamic-routes.ts).
                    name: 'bricks-preview',
                    path: '/preview/:pagename',
                    file: resolve(runtimeDir, 'modules/render/pages/[pagename].vue'),
                }
            );
        });
        // #endregion

        // #region Route middleware (layout + загрузка данных published-страниц)
        addRouteMiddleware({
            name: 'bricks-page-layout',
            path: resolve(runtimeDir, 'middleware/bricks-page-layout.global'),
            global: true,
        });
        // #endregion

        // #region Plugins
        addPlugin(resolve(runtimeDir, 'plugins/vue-icons'));
        addPlugin(resolve(runtimeDir, 'plugins/vee-validate'));
        addPlugin(resolve(runtimeDir, 'plugins/text-editor-toolbar'));
        addPlugin(resolve(runtimeDir, 'plugins/bricks-styles'));
        addPlugin(resolve(runtimeDir, 'plugins/bricks-dynamic-routes'));
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
            route: '/mock-api/bricks-components',
            handler: resolve(runtimeDir, 'server/routes/mock-api/bricks-components'),
        });
        // #endregion

        // #region Server (api/bricks — persistence-ручки)
        // Регистрируются всегда; выбор режима (локальная БД vs прокси) — runtime,
        // в proxy.client.ts: при заданном bricksDatabaseUrl /api/bricks/** не проксируются.
        const apiHandlers: Array<{
            route: string;
            method?: 'get' | 'post' | 'put' | 'patch' | 'delete';
            file: string;
        }> = [
            { route: '/api/bricks', method: 'get', file: 'server/api/bricks/index.get' },
            { route: '/api/bricks', method: 'post', file: 'server/api/bricks/index.post' },
            {
                route: '/api/bricks/published',
                method: 'get',
                file: 'server/api/bricks/published.get',
            },
            {
                route: '/api/bricks/media',
                method: 'get',
                file: 'server/api/bricks/media/index.get',
            },
            {
                route: '/api/bricks/media',
                method: 'post',
                file: 'server/api/bricks/media/index.post',
            },
            {
                route: '/api/bricks/media/:id',
                method: 'patch',
                file: 'server/api/bricks/media/[id].patch',
            },
            {
                route: '/api/bricks/media/:id',
                method: 'delete',
                file: 'server/api/bricks/media/[id].delete',
            },
            { route: '/api/bricks/:id', method: 'get', file: 'server/api/bricks/[id].get' },
            { route: '/api/bricks/:id', method: 'put', file: 'server/api/bricks/[id].put' },
            { route: '/api/bricks/:id', method: 'patch', file: 'server/api/bricks/[id].patch' },
            { route: '/api/bricks/:id', method: 'delete', file: 'server/api/bricks/[id].delete' },
        ];

        for (const { route, method, file } of apiHandlers) {
            addServerHandler({
                route,
                method,
                handler: resolve(runtimeDir, file),
            });
        }
        // #endregion
    },
});
