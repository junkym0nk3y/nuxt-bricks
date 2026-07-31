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
import { applyBricksRuntimeConfig } from './module-runtime-config';
import type { IBricksModuleOptions } from './types/module';
import type { IBricksRegistrationContext } from './types/moduleSetup';

// Опции модуля — часть публичного API пакета (`export *` в dist/types.d.mts)
export type { IBricksModuleOptions };

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
        // Одна очередь на инстанс Nuxt: build:before и dev-вотчер не должны
        // сканировать параллельно
        const manifestQueue = createBricksManifestQueue({
            srcDir: nuxt.options.srcDir,
            manifestDir,
        });
        // Незавершённый скан старого инстанса дожидается здесь: close
        // вызывается до build:before нового (@nuxt/cli, DevServer#load)
        nuxt.hook('close', () => manifestQueue.dispose());

        // Клиентский Vite-сервер: через него ошибка разбора brick-файла
        // показывается оверлеем поверх страницы
        let viteClientServer: ViteDevServer | undefined;

        /**
         * Показывает ошибку генерации манифеста разработчику: строка в терминал
         * и оверлей Vite поверх страницы, если dev-сервер уже поднят. Оверлей
         * снимется сам — следующая удачная генерация присылает перезагрузку.
         *
         * @param context - Что именно не удалось (событие вотчера или сборка).
         * @param error - Ошибка генерации.
         */
        function reportManifestFailure(context: string, error: unknown): void {
            const message = error instanceof Error ? error.message : String(error);

            console.error(`[nuxt-bricks] ${context} не обработано: ${message}`);
            viteClientServer?.hot.send({
                type: 'error',
                err: { message, stack: error instanceof Error ? (error.stack ?? '') : '' },
            });
        }

        // Сам манифест нужен только билдеру: библиотеку компонентов читает лишь
        // он, рендерер берёт brickPath прямо из схемы страницы.
        if (isBuilderEnabled) {
            // build:before, а не setup: nuxi build/prepare чистят buildDir
            // между setup модуля и сборкой, запись из setup была бы стёрта.
            nuxt.hook('build:before', async () => {
                try {
                    await manifestQueue.enqueue();
                } catch (error) {
                    // В сборке ошибка обязана быть фатальной: прод не должен
                    // тихо уехать без манифеста. В dev — наоборот: brick-файл
                    // правят на живом сервере, и неразобранный файл не должен
                    // уносить с собой загрузку инстанса. На диске остаётся
                    // прежний манифест, редактор продолжает работать на нём, а
                    // причина видна разработчику. Иначе любой рестарт, начатый
                    // до починки файла, оставлял бы редактор недоступным.
                    if (!isDev) {
                        throw error;
                    }

                    reportManifestFailure('генерация манифеста brick-компонентов', error);
                }
            });

            // Манифест доезжает до Nitro как server asset: в dev каталог
            // монтируется fs-драйвером (свежесть при add/unlink), в prod
            // содержимое запекается в серверный бандл — ручка компонентов
            // не зависит от process.cwd() и работает из одного .output.
            // ignore — про временные файлы атомарной публикации: nitro отдаёт
            // его и в globby prod-запекания, и в dev-fsDriver, так что
            // недописанный manifest.json.<pid>.<n>.tmp в namespace не попадёт
            nuxt.hook('nitro:config', (nitroConfig) => {
                nitroConfig.serverAssets = nitroConfig.serverAssets || [];
                nitroConfig.serverAssets.push({
                    baseName: BRICKS_MANIFEST_ASSET_BASE,
                    dir: manifestDir,
                    ignore: [`**/*${BRICKS_MANIFEST_TEMP_SUFFIX}`],
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

                // Nuxt зовёт хук без await, поэтому любой реджект отсюда уходит
                // в необслуженный промис, а Node с дефолтным
                // --unhandled-rejections=throw убивает на этом dev-сервер
                try {
                    // Состав glob'а изменился — только рестарт, и он идёт
                    // безусловно. Пробный скан перед ним ничего не давал бы:
                    // состояние «рестарт ещё нужен» пришлось бы держать между
                    // инстансами, а рестарт как раз создаёт новый инстанс модуля
                    // — на той стороне такого состояния уже нет. Вместо этого
                    // неразобранный файл не роняет `build:before` в dev.
                    if (event === 'add' || event === 'unlink') {
                        await nuxt.callHook('restart');

                        return;
                    }

                    // change: состав тот же, но метаданные могли поменяться —
                    // это уже про манифест, то есть только про билдер
                    if (event !== 'change' || !isBuilderEnabled) {
                        return;
                    }

                    await manifestQueue.enqueue();

                    // Метаданные бриков закешированы в useAsyncData('bricks-components') —
                    // точечного HMR тут недостаточно
                    viteClientServer?.hot.send({ type: 'full-reload' });
                } catch (error) {
                    reportManifestFailure(`событие ${event} brick-файла ${path}`, error);
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
