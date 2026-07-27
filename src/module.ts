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
// Side-effect type import: подтягивает augmentation NuxtOptions.i18n и хука i18n:registerModule
import type {} from '@nuxtjs/i18n';
import {
    generateBricksManifest,
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
    type IBricksRegistrationContext,
} from './module-setup';
import { applyBricksRuntimeConfig } from './module-runtime-config';
import type { TBricksBackendMode } from './module-backend-config';

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
     * Режим data backend: где живут данные страниц, версий и media metadata.
     * Файлы (S3), sharp и browser-facing /api/bricks/** всегда локальные.
     * - 'builtin' — встроенный PostgreSQL-адаптер (см. database.url);
     * - 'external' — пользовательский HTTP-backend по контракту
     *   docs/external-backend-contract.md (HTTP-реализация IStorageAdapter).
     * mode — build-time (менять после сборки unsupported), дефолт 'builtin';
     * url/token/healthUrl runtime-переопределяемы: NUXT_BRICKS_BACKEND_URL /
     * _TOKEN / _HEALTH_URL.
     */
    backend?: {
        mode?: TBricksBackendMode;
        /**
         * Полный base-префикс bricks-API external-сервера (например
         * https://api.example.com/my-cms) — адаптер добавляет только
         * относительные пути, сегмент «bricks» не зашит.
         */
        url?: string;
        /** Readiness-URL external backend (готовность — только 2xx). */
        healthUrl?: string;
    };
    /**
     * PostgreSQL для дефолтного storage-адаптера (persistence, builtin-режим).
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
     * ENV-переопределение: NUXT_BRICKS_S3_*.
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
     * Dev-only проксирование не-bricks /api/* на backend host-проекта
     * (middleware регистрируется только при nuxt.options.dev; /api/bricks/**
     * никогда не проксируется — см. bricks.backend).
     * Адрес — server-only runtimeConfig (в client payload не попадает).
     * ENV: PROXY_URL (build-time fallback), NUXT_BRICKS_PROXY_URL
     * (runtime-override).
     */
    proxy?: {
        url?: string;
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
     *   builder/login/preview, плагины редактора, builder-ручки (библиотека
     *   компонентов, media proxy, page thumbnail), editorial
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
            surfaces.routePrefixes
        );
        // Невалидная конфигурация backend (database-auth + external) валит
        // сборку сразу — тихо сломанного прода не будет
        if (backendResolution.errors.length > 0) {
            throw new Error(`[nuxt-bricks] ${backendResolution.errors.join('\n\n')}`);
        }
        // Носитель разрешённого режима — регистрация Nitro-плагинов, а не
        // runtimeConfig: NUXT_-env не может переключить mode в обход
        // build-time валидации (registry берёт дефолтную фабрику из плагина)
        if (backendResolution.mode === 'external') {
            addServerPlugin(resolve(runtimeDir, 'server/plugins/externalBackendStorage'));
        }
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

        // #region Vite (optimizeDeps)
        // Prebundle-список — зависимости UI билдера; render-only он не нужен
        if (isBuilderEnabled) {
            nuxt.options.vite = defu(nuxt.options.vite, {
                optimizeDeps: {
                    include: VITE_OPTIMIZE_INCLUDE,
                },
            });
        }
        // #endregion

        // #region Манифест brick-компонентов и dev-вотчер
        const manifestDir = resolveBricksManifestDir(nuxt.options.buildDir);

        // Сам манифест нужен только билдеру: библиотеку компонентов читает лишь
        // он, рендерер берёт brickPath прямо из схемы страницы.
        if (isBuilderEnabled) {
            // build:before, а не setup: nuxi build/prepare чистят buildDir
            // между setup модуля и сборкой, запись из setup была бы стёрта
            nuxt.hook('build:before', async () => {
                await generateBricksManifest({ srcDir: nuxt.options.srcDir, manifestDir });
            });

            // Манифест доезжает до Nitro как server asset: в dev каталог
            // монтируется fs-драйвером (свежесть при add/unlink), в prod
            // содержимое запекается в серверный бандл — ручка компонентов
            // не зависит от process.cwd() и работает из одного .output
            nuxt.hook('nitro:config', (nitroConfig) => {
                nitroConfig.serverAssets = nitroConfig.serverAssets || [];
                nitroConfig.serverAssets.push({
                    baseName: BRICKS_MANIFEST_ASSET_BASE,
                    dir: manifestDir,
                });
            });
        }

        // Dev-вотчер brick-файлов на штатном хуке Nuxt. Состав
        // `import.meta.glob` в useBrickImports разворачивает Vite на этапе
        // трансформации — на add/unlink пересобрать карту загрузчиков может
        // только рестарт, и у Nuxt для этого есть хук `restart` (сам Nuxt
        // вызывает его так же — для структурно значимых файлов и создания
        // каталога компонентов). Рестарт прогоняет и `build:before`, то есть
        // манифест перегенерируется без нашего участия.
        // Карту загрузчиков читает не только билдер: published-рендерер тянет
        // brick-модули тем же glob'ом, поэтому рестарт нужен обеим поверхностям.
        if (isDev && (isBuilderEnabled || arePublishedPagesEnabled)) {
            let viteClientServer: ViteDevServer | undefined;

            nuxt.hook('vite:serverCreated', (server, env) => {
                // Клиентский сервер — тот, чей hot-канал слушает браузер
                if (env.isClient) {
                    viteClientServer = server;
                }
            });

            nuxt.hook('builder:watch', async (event, path) => {
                if (!isBrickFilePath(nuxt.options.srcDir, path)) {
                    return;
                }

                // Состав glob'а изменился — только рестарт
                if (event === 'add' || event === 'unlink') {
                    return nuxt.callHook('restart');
                }

                // change: состав тот же, но category могла поменяться —
                // это уже про манифест, то есть только про билдер
                if (event !== 'change' || !isBuilderEnabled) {
                    return;
                }

                await generateBricksManifest({ srcDir: nuxt.options.srcDir, manifestDir });

                // Метаданные бриков закешированы в useAsyncData('bricks-components') —
                // точечного HMR тут недостаточно (см. BM-06 в
                // docs/brick-manifest-followups.md)
                viteClientServer?.hot.send({ type: 'full-reload' });
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

        // #region Server (middleware + api/bricks)
        addServerHandler({
            handler: resolve(runtimeDir, 'server/middleware/auth'),
            middleware: true,
        });
        // devProxy — только dev-сборка: проксирование не-bricks /api/* на
        // PROXY_URL (host-API проекта); в production middleware не существует
        if (isDev) {
            addServerHandler({
                handler: resolve(runtimeDir, 'server/middleware/devProxy'),
                middleware: true,
            });
        }
        // /api/bricks — по манифесту BRICKS_API_HANDLERS (render-only
        // оставляет public read-model)
        registerBricksServerHandlers(registrationContext);
        // #endregion
    },
});
