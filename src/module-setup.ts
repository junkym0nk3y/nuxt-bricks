/**
 * Build-time хелперы setup'а модуля (см. src/module.ts): резолв поверхностей
 * (префиксы + feature flags), Pinia/i18n билдера, регистрация страниц и
 * серверных ручек. Вынесены из module.ts, вызываются только из его setup.
 */
import { addServerHandler, hasNuxtModule, installModule, type Resolver } from '@nuxt/kit';
import { defu } from 'defu';
import type { Nuxt, NuxtPage } from '@nuxt/schema';
import type { IBricksModuleOptions } from './module';
import { PAGE_ROUTE_SEGMENT } from './runtime/modules/common/constants/publish';
import { BRICKS_ROUTE_NAMES } from './runtime/modules/common/constants/routes';
import {
    DEFAULT_BRICKS_ROUTE_PREFIXES,
    validateBricksRoutePrefixes,
    type IBricksRoutePrefixes,
} from './runtime/modules/common/utils/bricks/routePaths';
import { BRICKS_API_HANDLERS } from './api-handlers';

// #region Types
/** Активные поверхности модуля: префиксы маршрутов + feature flags. */
export interface IBricksSurfaces {
    /** Валидированные префиксы билдера/превью. */
    routePrefixes: IBricksRoutePrefixes;
    /** UI билдера включён (страницы, плагины редактора, editorial API, i18n, Pinia). */
    isBuilderEnabled: boolean;
    /** Catch-all маршруты live-рендера включены. */
    arePublishedPagesEnabled: boolean;
}

/** Контекст регистрации файловых сущностей (страницы, ручки). */
export interface IBricksRegistrationContext {
    /** resolver модуля (createResolver(import.meta.url).resolve). */
    resolve: Resolver['resolve'];
    /** Абсолютный путь src/runtime. */
    runtimeDir: string;
    /** Активные поверхности. */
    surfaces: IBricksSurfaces;
}
// #endregion

/**
 * Резолвит поверхности модуля из опций: префиксы (fail-fast валидация)
 * и feature flags; логирует отклонения от дефолтов.
 *
 * @param options - Опции модуля из nuxt.config.
 * @returns Активные поверхности.
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
 * Логирует нестандартную конфигурацию поверхностей при старте модуля.
 *
 * @param surfaces - Активные поверхности.
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
 * Подключает зависимости поверхности билдера: Pinia и i18n (переводы ru/en).
 * render и published-страницы их не используют — вызывается только при
 * включённом features.builder.
 *
 * @param nuxt - Инстанс Nuxt.
 * @param options - Опции модуля.
 * @param localesDir - Абсолютный путь к runtime/locales.
 */
export async function setupBricksBuilderModules(
    nuxt: Nuxt,
    options: IBricksModuleOptions,
    localesDir: string
): Promise<void> {
    // Fail-fast на неверный порядок модулей: если @nuxtjs/i18n уже установлен,
    // его setup прочитал опции ДО применения bricks-дефолтов (strategy no_prefix
    // и др.) — маршруты билдера переписываются/переименовываются и отдают 404.
    // Проверено живой сборкой: предупреждения недостаточно, ломается роутинг.
    if (hasNuxtModule('@nuxtjs/i18n')) {
        throw new Error(
            '[nuxt-bricks] @nuxtjs/i18n is installed before nuxt-bricks — builder routes would break. Place nuxt-bricks BEFORE @nuxtjs/i18n in nuxt.config modules (bricks applies safe i18n defaults and registers its translations).'
        );
    }

    if (!hasNuxtModule('@pinia/nuxt')) {
        await installModule('@pinia/nuxt');
    }

    // Подписка ДО installModule: @nuxtjs/i18n вызывает хук в своём setup.
    let isI18nRegistered = false;
    nuxt.hook('i18n:registerModule', (register) => {
        isI18nRegistered = true;
        register({
            langDir: localesDir,
            locales: [
                { code: 'ru', language: 'ru-RU', file: 'ru.json' },
                { code: 'en', language: 'en-US', file: 'en.json' },
            ],
        });
    });

    // Дефолты применяются до установки i18n (defu: опции потребителя из
    // nuxt.options.i18n побеждают) — голая стратегия prefix_except_default
    // переписала бы маршруты и дашборд отдавал бы 404.
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

    // hasNuxtModule выше гарантирует, что i18n ещё не установлен
    await installModule('@nuxtjs/i18n');

    // app:resolve — после modules:done: @nuxtjs/i18n вызывает i18n:registerModule
    // из собственного modules:done-хука, который при явном подключении i18n
    // потребителем регистрируется позже bricks-хуков. Без переводов UI билдера
    // отображает сырые ключи — это всегда ошибка конфигурации, валим сборку.
    nuxt.hook('app:resolve', () => {
        if (!isI18nRegistered) {
            throw new Error(
                '[nuxt-bricks] i18n:registerModule hook was not called — builder translations are missing. Place nuxt-bricks BEFORE @nuxtjs/i18n in nuxt.config modules.'
            );
        }
    });
}

/**
 * Регистрирует страницы модуля (extendPages-callback): билдер + превью
 * (features.builder) и статические catch-all live-рендера
 * (features.publishedPages), пути — из bricks.routes.
 *
 * @param pages - Массив страниц Nuxt.
 * @param context - Контекст регистрации.
 */
export function registerBricksPages(pages: NuxtPage[], context: IBricksRegistrationContext): void {
    const { resolve, runtimeDir, surfaces } = context;
    const { routePrefixes, isBuilderEnabled, arePublishedPagesEnabled } = surfaces;

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
                        // Статический сегмент бьёт :pagename по ранжированию vue-router
                        // независимо от порядка. В basic-режиме страница редиректит
                        // на дашборд билдера.
                        name: BRICKS_ROUTE_NAMES.builderLogin,
                        path: 'login',
                        file: resolve(runtimeDir, 'modules/builder/auth/pages/login.vue'),
                    },
                    {
                        name: BRICKS_ROUTE_NAMES.builderPage,
                        path: ':pagename',
                        file: resolve(runtimeDir, 'modules/builder/app/pages/[pagename].vue'),
                    },
                ],
            },
            {
                // Превью-режим определяется именем этого роута (bricks-preview),
                // query ?preview=true больше не используется.
                name: BRICKS_ROUTE_NAMES.preview,
                path: `${routePrefixes.previewPrefix}/:pagename`,
                file: resolve(runtimeDir, 'modules/render/pages/[pagename].vue'),
            }
        );
    }

    // Live-рендер published — два статических catch-all маршрута вместо
    // route-per-page (бывший plugins/bricks-dynamic-routes.ts грузил весь
    // список published на каждый SSR и не имел SPA-invalidation).
    // Страница резолвится прямым lookup в middleware bricks-page-layout;
    // regex-сегменты сужают перехват до валидных pagename/urlPrefix.
    // Статические маршруты потребителя всегда побеждают по ранжированию
    // vue-router; корневой динамический маршрут потребителя без custom
    // regex (pages/[slug].vue) проиграет — задокументировано в README.
    if (arePublishedPagesEnabled) {
        const publishedPageFile = resolve(runtimeDir, 'modules/render/pages/[pagename].vue');
        pages.push(
            {
                name: BRICKS_ROUTE_NAMES.page,
                path: `/:pagename(${PAGE_ROUTE_SEGMENT})`,
                file: publishedPageFile,
                meta: { isPublishedBricksPage: true },
            },
            {
                name: BRICKS_ROUTE_NAMES.pagePrefixed,
                path: `/:urlPrefix(${PAGE_ROUTE_SEGMENT})+/:pagename(${PAGE_ROUTE_SEGMENT})`,
                file: publishedPageFile,
                meta: { isPublishedBricksPage: true },
            }
        );
    }
}

/**
 * Регистрирует серверные ручки /api/bricks/** из манифеста BRICKS_API_HANDLERS
 * (persistence, auth, health плюс builder-поверхность: библиотека компонентов,
 * media proxy, page thumbnail — бывшие /mock-api/** ручки).
 * Render-only режим оставляет только public read-model (isPublic) — editorial
 * CRUD, auth- и builder-ручки без UI билдера не нужны (сужение поверхности).
 *
 * /api/bricks/** всегда обслуживаются локальными ручками; data backend под
 * ними выбирает bricks.backend.mode (builtin PostgreSQL vs external HTTP,
 * см. module-backend-config.ts). devProxy (dev-only) bricks-пути не трогает.
 *
 * @param context - Контекст регистрации.
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

// Модули, чьи чанки не должны prefetch'иться на published-страницах: редакторский
// стек (TipTap/ProseMirror, JSON-редактор), документация билдера и весь код
// builder/text-editor. Swiper сюда не входит: его чанк нужен странице со слайдером
// сразу (SSR-fallback → hydration), а страница без слайдера его и так не рендерит.
const BUILDER_ONLY_CHUNK_PATTERN =
    /@tiptap|prosemirror|vanilla-jsoneditor|json-editor-vue|markdown-it|\/modules\/(builder|text-editor)\/|\/docs\/guide\/|\/plugins\/builder\/|\/plugins\/icons\/builderIcons/;

/**
 * Отключает `<link rel="prefetch">` для builder-only чанков. Vite ставит
 * prefetch-хинты на dynamic imports отрендеренных модулей, поэтому посетитель
 * published-страницы в idle скачивал бы весь редакторский стек (например,
 * TipTap-цепочку inline-editing через BlockText). Флагуются entries по паттерну
 * плюс транзитивное замыкание их imports/dynamicImports (vendor-чанки с
 * hash-именами иначе не атрибутировать); чанк, достижимый статическими
 * импортами из не-флагованного entry, остаётся prefetch'имым (общий vendor).
 * `preload` не трогаем — он нужен гидратации реально используемых чанков.
 *
 * @param nuxt - Инстанс Nuxt.
 */
export function disableBuilderChunkPrefetch(nuxt: Nuxt): void {
    nuxt.hook('build:manifest', (manifest) => {
        const flagged = new Set(
            Object.keys(manifest).filter((key) => BUILDER_ONLY_CHUNK_PATTERN.test(key))
        );

        // Замыкание СТАТИЧЕСКИХ импортов флагованных входов. dynamicImports не
        // обходим: через entry-чанк они дотянулись бы до всех lazy-чанков
        // приложения (включая чанки потребителя и error-страницы Nuxt).
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

        // Чанки, достижимые статическими импортами из не-флагованных entries,
        // остаются prefetch'имыми — они нужны и вне билдера
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
