import { existsSync } from 'node:fs';
import {
    defineNuxtModule,
    createResolver,
    addPlugin,
    addLayout,
    addRouteMiddleware,
    addServerHandler,
    extendPages,
} from '@nuxt/kit';
import { defu } from 'defu';
// Side-effect type import: подтягивает augmentation NuxtOptions.i18n и хука i18n:registerModule
import type {} from '@nuxtjs/i18n';
import { brickWatchPlugin } from './runtime/modules/common/utils/routing/vite-brick-watch';
import { BRICKS_PUBLIC_ASSETS_BASE } from './runtime/modules/common/utils/bricks/assetPaths';
import { DEFAULT_BRICKS_ROUTE_PREFIXES } from './runtime/modules/common/utils/bricks/routePaths';
import {
    disableBuilderChunkPrefetch,
    registerBricksPages,
    registerBricksServerHandlers,
    resolveBricksSurfaces,
    setupBricksBuilderModules,
    type IBricksRegistrationContext,
} from './module-setup';
import { applyBricksRuntimeConfig } from './module-runtime-config';

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
     * Режим авторизации защищённых путей (builder/preview/мутации API).
     * - 'basic' (дефолт) — HTTP Basic Auth с парой креденшелов из basicAuth/env.
     * - 'database' — пользователи в Postgres (scrypt-хеш), страница логина
     *   /bricks/login, cookie-сессии в БД (таблицы bricks_users/bricks_sessions).
     * ENV-переопределение: BRICKS_AUTH_MODE, BRICKS_AUTH_SESSION_MAX_AGE.
     * Провижининг пользователей — вручную (см. CLI bricks-hash-password).
     */
    auth?: {
        mode?: 'basic' | 'database';
        /** Срок жизни cookie-сессии в секундах (дефолт: 604800 — 7 дней). */
        sessionMaxAgeSeconds?: number;
    };
    /**
     * PostgreSQL для дефолтного storage-адаптера (persistence).
     * Если url задан — /api/bricks/** обслуживаются локальными Nitro-ручками.
     * Строку подключения задавать через ENV NUXT_BRICKS_DATABASE_URL —
     * секретам не место в nuxt.config.
     */
    database?: {
        url?: string;
    };
    /**
     * Количество хранимых версий страницы: снапшот прежнего состояния создаётся
     * при каждом сохранении, меняющем `schema` (реализуется storage-адаптером).
     * Дефолт 5, `0` — версионирование выключено.
     * ENV-переопределение: NUXT_BRICKS_VERSIONS_LIMIT.
     */
    versionsLimit?: number;
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
        /** Managed-префикс ключей медиа-файлов (дефолт 'bricks-media/'). */
        prefix?: string;
        /** Managed-префикс ключей превью страниц (дефолт 'bricks-thumbnails/'). */
        thumbnailsPrefix?: string;
    };
    /**
     * Проксирование /api/* на внешний backend (dev-режим / свой REST API).
     * Если database.url не задан, /api/bricks/** тоже уходят на прокси.
     * Адреса — server-only runtimeConfig (в client payload не попадают).
     * ENV: PROXY_URL / NUXT_SERVER_CACHE_URL (build-time fallback),
     * NUXT_BRICKS_PROXY_URL / NUXT_BRICKS_SSR_PROXY_URL (runtime-override).
     */
    proxy?: {
        url?: string;
        /** Отдельный адрес backend для SSR-запросов (внутренняя сеть). */
        ssrUrl?: string;
        /**
         * Health-эндпоинт backend'а для readiness-пробы (`/api/bricks/health/
         * ready`): GET по этому URL, готовность — только 2xx. Без него проба
         * проверяет лишь сетевую достижимость PROXY_URL (любой ответ < 500) —
         * осознанное ограничение: неверный путь или отсутствующий editorial
         * API на живом хосте не детектируется. Runtime-override:
         * NUXT_BRICKS_PROXY_HEALTH_URL.
         */
        healthUrl?: string;
    };
    /**
     * Политика data sources published-страницы (выполняются рендерером
     * на каждый SSR/refresh через выделенный публичный клиент: без cookie,
     * с таймаутом; методы — только GET/HEAD).
     */
    dataSources?: {
        /**
         * Хосты, для которых разрешены абсолютные http(s)-URL data sources
         * (точное совпадение hostname, без протокола и порта).
         * Дефолт: пусто — разрешены только относительные URL (`/api/...`).
         */
        allowedHosts?: string[];
        /** Таймаут одного запроса, мс (дефолт 10000). */
        timeoutMs?: number;
        /** Максимум одновременных запросов на страницу (дефолт 6). */
        concurrency?: number;
        /** Лимит размера одного ответа, байт (дефолт 1 МБ, JSON-length approximation). */
        maxResponseBytes?: number;
        /** Максимум запросов data sources на один прогон страницы (дефолт 24). */
        maxRequestsPerPage?: number;
        /** Суммарный wall-clock budget одного прогона, мс (дефолт 15000). */
        totalDeadlineMs?: number;
    };
    /**
     * Доверять заголовку x-forwarded-for при определении клиентского IP
     * (ключи rate limiter'ов: upload/thumbnail/login). Дефолт false —
     * используется только socket-адрес. Включать только за собственным
     * reverse proxy (ровно один доверенный хоп; берётся последний элемент
     * заголовка — дописанный прокси, первый клиент может подделать).
     * ENV-переопределение: NUXT_BRICKS_TRUST_PROXY.
     */
    trustProxy?: boolean;
    /**
     * Локализация интерфейса билдера (ru/en).
     * defaultLocale применяется, только если @nuxtjs/i18n ставит сам bricks
     * (у потребителя модуль не подключён).
     */
    i18n?: {
        defaultLocale?: 'ru' | 'en';
    };
    /**
     * Префиксы страниц модуля (build-time, env-override не поддерживается).
     * Формат: ведущий `/`, lowercase-сегменты [a-z0-9-], без trailing slash;
     * префиксы не должны пересекаться. Невалидная конфигурация валит сборку.
     * - builderPrefix — дашборд `<prefix>`, редактор `<prefix>/:pagename`,
     *   логин `<prefix>/login` (дефолт: '/bricks')
     * - previewPrefix — превью рендера `<prefix>/:pagename` (дефолт: '/preview')
     */
    routes?: {
        builderPrefix?: string;
        previewPrefix?: string;
    };
    /**
     * Поверхности модуля (build-time).
     * - builder (дефолт true) — UI билдера целиком: страницы
     *   builder/login/preview, плагины редактора, mock-api ручки, editorial
     *   API, i18n и Pinia. false — render-only деплой: остаются published
     *   catch-all маршруты, public read-model и auth-защита путей.
     * - publishedPages (дефолт true) — статические catch-all маршруты
     *   live-рендера. false — модуль не перехватывает URL приложения,
     *   published-страницы доступны только через превью.
     */
    features?: {
        builder?: boolean;
        publishedPages?: boolean;
    };
}
// #endregion

// #region Constants
const VITE_OPTIMIZE_INCLUDE = [
    'yup',
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

        // #region Routes и feature flags (fail-fast валидация префиксов)
        const surfaces = resolveBricksSurfaces(options);
        const { isBuilderEnabled } = surfaces;
        const registrationContext: IBricksRegistrationContext = {
            resolve,
            runtimeDir,
            surfaces,
        };
        // #endregion

        // #region runtimeConfig
        const runtimeConfig = nuxt.options.runtimeConfig as Record<string, unknown>;
        applyBricksRuntimeConfig(runtimeConfig, options, surfaces.routePrefixes);
        // #endregion

        // #region Public assets (превью layout-блоков, плейсхолдеры, картинки документации)
        // Выделенный префикс /_bricks/ вместо корня: ассеты билдера не смешиваются
        // с public/ потребителя, а клиентские URL строит resolveBricksAssetUrl
        // (учитывает app.baseURL). Ассеты нужны только поверхности билдера.
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

        // #region Experimental flags (нужны для defineRouteRules / appManifest)
        nuxt.options.experimental.appManifest = nuxt.options.experimental.appManifest ?? true;
        nuxt.options.experimental.inlineRouteRules =
            nuxt.options.experimental.inlineRouteRules ?? true;
        // #endregion

        // #region Зависимые модули + i18n (только поверхность билдера)
        // render и published-страницы не используют ни Pinia, ни vue-i18n —
        // в render-only режиме host-приложение не получает лишних модулей.
        // Внутри — fail-fast при неверном порядке модулей (@nuxtjs/i18n до bricks).
        if (isBuilderEnabled) {
            await setupBricksBuilderModules(nuxt, options, resolve(runtimeDir, 'locales'));
        }

        // Prefetch-хинты builder-only чанков не должны скачивать редакторский
        // стек посетителям published-страниц (см. disableBuilderChunkPrefetch).
        disableBuilderChunkPrefetch(nuxt);
        // #endregion

        // #region Стили
        // Только собственные scoped-стили модуля (variables/transitions/fonts + reset
        // под body.bricks-page). Swiper CSS импортирует BlockSlider.vue в свой чанк.
        // Из src подключаются .scss; в собранном пакете mkdist компилирует их в .css
        // (sass у потребителя не нужен) — берём то расширение, которое существует.
        // fonts — отдельной entry: url() на woff2 корректен только относительно
        // самого файла (sass не ребейзит url при @use, см. bundle.scss).
        for (const stylesheet of ['bundle', 'default', 'common/fonts']) {
            const scssPath = resolve(runtimeDir, `assets/scss/${stylesheet}.scss`);
            nuxt.options.css.push(
                existsSync(scssPath)
                    ? scssPath
                    : resolve(runtimeDir, `assets/scss/${stylesheet}.css`)
            );
        }
        // #endregion

        // #region Vite (optimizeDeps + watch brick-файлов)
        // Prebundle-список — зависимости UI билдера; render-only он не нужен
        if (isBuilderEnabled) {
            nuxt.options.vite = defu(nuxt.options.vite, {
                optimizeDeps: {
                    include: VITE_OPTIMIZE_INCLUDE,
                },
            });
        }
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

        // #region Pages (builder + preview по features.builder, published catch-all
        // по features.publishedPages; пути — из bricks.routes)
        extendPages((pages) => {
            registerBricksPages(pages, registrationContext);
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
        // vue-icons (BricksIcon + ядро иконок) и bricks-styles нужны и published-
        // страницам; vee-validate и text-editor-toolbar — только UI билдера
        // (и без того лениво гейтятся runOnBuilderRoute).
        addPlugin(resolve(runtimeDir, 'plugins/vue-icons'));
        addPlugin(resolve(runtimeDir, 'plugins/bricks-styles'));
        if (isBuilderEnabled) {
            addPlugin(resolve(runtimeDir, 'plugins/vee-validate'));
            addPlugin(resolve(runtimeDir, 'plugins/text-editor-toolbar'));
        }
        // #endregion

        // #region Server (middleware + mock-api + api/bricks)
        addServerHandler({
            handler: resolve(runtimeDir, 'server/middleware/auth'),
            middleware: true,
        });
        addServerHandler({
            handler: resolve(runtimeDir, 'server/middleware/proxy.client'),
            middleware: true,
        });
        // mock-api (медиа/библиотека компонентов) — только билдер; /api/bricks —
        // по манифесту BRICKS_API_HANDLERS (render-only оставляет public read-model)
        registerBricksServerHandlers(registrationContext);
        // #endregion
    },
});
