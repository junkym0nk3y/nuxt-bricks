// Utils
import {
    DEFAULT_BRICKS_ROUTE_PREFIXES,
    isBuilderPath,
    isProtectedBricksHtmlPath,
    stripPathBase,
    type IBricksRoutePrefixes,
} from '../../modules/common/utils/bricks/routePaths';

// Nuxt
import { useRequestURL, useRouter, useRuntimeConfig } from '#imports';

/**
 * Выполняет `install` один раз при первом попадании на роут билдера
 * (`bricks.routes.builderPrefix`, дефолт `/bricks`): на начальной загрузке
 * (SSR и клиент — до рендера/гидрации, поэтому вызов нужно await'ить
 * из тела async-плагина) или в `beforeResolve` при SPA-переходе с published-страницы.
 * Тяжёлая часть плагина остаётся в lazy-чанке за `import()` и не попадает в бандл
 * published-страниц.
 *
 * @param install - Асинхронная установка тяжёлой части плагина.
 */
export async function runOnBuilderRoute(install: () => Promise<void>): Promise<void> {
    await runOnBricksRoute(install, isBuilderPath);
}

/**
 * То же для поверхностей билдера И превью.
 *
 * Нужна тем чанкам, которые видны на обеих: набор устройств правится в билдере,
 * но глиф выбранного устройства показывает и баннер превью, а превью-роут
 * лежит за `previewPrefix` и в `runOnBuilderRoute` не попадает.
 *
 * @param install - Асинхронная установка тяжёлой части плагина.
 */
export async function runOnBricksSurface(install: () => Promise<void>): Promise<void> {
    await runOnBricksRoute(install, isProtectedBricksHtmlPath);
}

/**
 * Общая механика однократной установки по предикату пути.
 *
 * @param install - Асинхронная установка.
 * @param matches - Предикат «этот путь обслуживается».
 */
async function runOnBricksRoute(
    install: () => Promise<void>,
    matches: (prefixes: IBricksRoutePrefixes, pathname: string) => boolean
): Promise<void> {
    const router = useRouter();
    const config = useRuntimeConfig();
    const prefixes =
        (config.public.bricksRoutes as IBricksRoutePrefixes | undefined) ??
        DEFAULT_BRICKS_ROUTE_PREFIXES;
    let isInstalled = false;

    /**
     * Однократно запускает install, если путь принадлежит билдеру.
     */
    async function ensureInstalled(path: string): Promise<void> {
        if (isInstalled || !matches(prefixes, path)) {
            return;
        }

        isInstalled = true;
        await install();
    }

    // SPA-переход на билдер с published-страницы; install await'ится до рендера
    router.beforeResolve(async (to) => {
        await ensureInstalled(to.path);
    });

    // Начальный URL запроса (router.currentRoute в момент плагина — ещё placeholder);
    // фактический pathname содержит app.baseURL — стрипаем до логического пути.
    // await блокирует bootstrap только на builder-роутах — published не задерживается.
    const baseURL = (config.app?.baseURL as string | undefined) || '/';
    await ensureInstalled(stripPathBase(useRequestURL().pathname, baseURL));
}
