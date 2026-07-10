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
import {
    DEFAULT_BRICKS_ROUTE_PREFIXES,
    type IBricksRoutePrefixes,
} from './runtime/modules/common/utils/bricks/routePaths';
import {
    registerBricksPages,
    registerBricksServerHandlers,
    resolveBricksSurfaces,
    setupBricksBuilderModules,
    type IBricksRegistrationContext,
} from './module-setup';

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
 * Логирует выбранный auth-режим при старте модуля.
 *
 * @param mode - Режим авторизации ('basic' | 'database').
 * @param hasDatabase - Сконфигурирована ли локальная БД.
 */
function logAuthMode(mode: string, hasDatabase: boolean): void {
    if (mode === 'database') {
        console.info('[nuxt-bricks] Auth: database mode (users/sessions in PostgreSQL)');

        if (!hasDatabase) {
            console.warn(
                '[nuxt-bricks] bricks.auth.mode = "database", но bricks.database.url не задан — защищённые пути будут отвечать 503'
            );
        }

        return;
    }

    console.info('[nuxt-bricks] Auth: basic mode (HTTP Basic Auth)');
}

/**
 * Заполняет runtimeConfig модуля: basic-auth, persistence (Postgres/S3), proxy,
 * префиксы маршрутов. Дефолты переопределяемы в production через ENV
 * (NUXT_BRICKS_*, legacy-имена — fallback), кроме bricksRoutes — пути страниц
 * фиксируются на сборке, env-override дал бы рассинхрон с зарегистрированными
 * маршрутами.
 *
 * @param runtimeConfig - nuxt.options.runtimeConfig.
 * @param options - Опции модуля из nuxt.config.
 * @param routePrefixes - Валидированные префиксы маршрутов.
 */
function applyBricksRuntimeConfig(
    runtimeConfig: Record<string, unknown>,
    options: IBricksModuleOptions,
    routePrefixes: IBricksRoutePrefixes
): void {
    runtimeConfig.basicAuthUsername =
        runtimeConfig.basicAuthUsername ??
        process.env.BASIC_AUTH_USERNAME ??
        options.basicAuth?.username;
    runtimeConfig.basicAuthPassword =
        runtimeConfig.basicAuthPassword ??
        process.env.BASIC_AUTH_PASSWORD ??
        options.basicAuth?.password;

    applyBricksPersistenceRuntimeConfig(runtimeConfig, options);

    // Proxy-режим: /api/* → внешний backend. Ключи server-only: адрес backend
    // не светится в client payload, клиент ходит через proxy middleware.
    // Runtime-override: NUXT_BRICKS_PROXY_URL / NUXT_BRICKS_SSR_PROXY_URL.
    runtimeConfig.bricksProxyUrl =
        runtimeConfig.bricksProxyUrl ?? options.proxy?.url ?? process.env.PROXY_URL ?? '';
    runtimeConfig.bricksSsrProxyUrl =
        runtimeConfig.bricksSsrProxyUrl ??
        options.proxy?.ssrUrl ??
        process.env.NUXT_SERVER_CACHE_URL ??
        '';

    // Доверие x-forwarded-for для клиентского IP rate limiter'ов (server-only;
    // имя ключа NUXT_BRICKS_TRUST_PROXY даёт runtime-override без ребилда)
    runtimeConfig.bricksTrustProxy =
        runtimeConfig.bricksTrustProxy ??
        process.env.NUXT_BRICKS_TRUST_PROXY ??
        options.trustProxy ??
        false;

    const publicConfig = (runtimeConfig.public ?? {}) as Record<string, unknown>;
    runtimeConfig.public = publicConfig;

    // Единый источник префиксов для клиента и auth-матрицы (build-time)
    publicConfig.bricksRoutes = routePrefixes;

    applyBricksAuthRuntimeConfig(runtimeConfig, publicConfig, options);

    logPersistenceMode(
        Boolean(runtimeConfig.bricksDatabaseUrl),
        Boolean(runtimeConfig.bricksProxyUrl)
    );
    logAuthMode(runtimeConfig.bricksAuthMode as string, Boolean(runtimeConfig.bricksDatabaseUrl));
}

/**
 * Заполняет runtimeConfig persistence-слоя: PostgreSQL, версионирование страниц, S3
 * (server-only, секреты не в public).
 *
 * @param runtimeConfig - nuxt.options.runtimeConfig.
 * @param options - Опции модуля из nuxt.config.
 */
function applyBricksPersistenceRuntimeConfig(
    runtimeConfig: Record<string, unknown>,
    options: IBricksModuleOptions
): void {
    runtimeConfig.bricksDatabaseUrl =
        runtimeConfig.bricksDatabaseUrl ??
        process.env.NUXT_BRICKS_DATABASE_URL ??
        options.database?.url ??
        '';

    // Версионирование страниц: глубина истории снапшотов (0 — выкл).
    // Имя ключа NUXT_BRICKS_VERSIONS_LIMIT даёт runtime-override в проде без ребилда.
    runtimeConfig.bricksVersionsLimit =
        runtimeConfig.bricksVersionsLimit ??
        process.env.NUXT_BRICKS_VERSIONS_LIMIT ??
        options.versionsLimit;

    runtimeConfig.bricksS3 = defu(runtimeConfig.bricksS3 as object | undefined, options.s3, {
        endpoint: 'https://storage.yandexcloud.net',
        region: 'ru-central1',
        bucket: process.env.YANDEX_STORAGE_BUCKET_NAME ?? '',
        accessKeyId: process.env.YANDEX_STORAGE_ACCESS_KEY_ID ?? '',
        secretAccessKey: process.env.YANDEX_STORAGE_SECRET_ACCESS_KEY ?? '',
        prefix: 'bricks-media/',
        thumbnailsPrefix: 'bricks-thumbnails/',
    });
}

/**
 * Заполняет runtimeConfig auth-режима: server-ключи + публичный флаг для
 * 401-интерцептора и login-страницы.
 * Runtime-нюанс: NUXT_BRICKS_AUTH_MODE переопределяет только server-ключ,
 * для клиента нужен и NUXT_PUBLIC_BRICKS_AUTH_MODE.
 *
 * @param runtimeConfig - nuxt.options.runtimeConfig.
 * @param publicConfig - runtimeConfig.public.
 * @param options - Опции модуля из nuxt.config.
 */
function applyBricksAuthRuntimeConfig(
    runtimeConfig: Record<string, unknown>,
    publicConfig: Record<string, unknown>,
    options: IBricksModuleOptions
): void {
    runtimeConfig.bricksAuthMode =
        runtimeConfig.bricksAuthMode ?? process.env.BRICKS_AUTH_MODE ?? options.auth?.mode;
    runtimeConfig.bricksAuthSessionMaxAge =
        runtimeConfig.bricksAuthSessionMaxAge ??
        process.env.BRICKS_AUTH_SESSION_MAX_AGE ??
        options.auth?.sessionMaxAgeSeconds;

    // Публичный флаг auth-режима (не секрет) — клиенту нужен для редиректа на login
    publicConfig.bricksAuthMode = publicConfig.bricksAuthMode ?? runtimeConfig.bricksAuthMode;
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

        // #region Зависимые модули + i18n (только поверхность билдера)
        // render и published-страницы не используют ни Pinia, ни vue-i18n —
        // в render-only режиме host-приложение не получает лишних модулей.
        // Внутри — fail-fast при неверном порядке модулей (@nuxtjs/i18n до bricks).
        if (isBuilderEnabled) {
            await setupBricksBuilderModules(nuxt, options, resolve(runtimeDir, 'locales'));
        }
        // #endregion

        // #region Стили
        // Только собственные scoped-стили модуля (variables/transitions/fonts + reset
        // под body.bricks-page). Swiper CSS импортирует BlockSlider.vue в свой чанк.
        nuxt.options.css.push(
            resolve(runtimeDir, 'assets/scss/bundle.scss'),
            resolve(runtimeDir, 'assets/scss/default.scss')
        );
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
