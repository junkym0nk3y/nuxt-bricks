// Utils
import {
    DEFAULT_BRICKS_ROUTE_PREFIXES,
    isBuilderPath,
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
        if (isInstalled || !isBuilderPath(prefixes, path)) {
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
