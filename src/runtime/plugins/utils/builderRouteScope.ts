// Nuxt
import { useRequestURL, useRouter } from '#imports';

const BUILDER_PATH_PREFIX = '/bricks';

/**
 * Проверяет, относится ли путь к поверхности билдера (`/bricks` и `/bricks/**`).
 *
 * @param path - Путь роута.
 * @returns true, если путь принадлежит билдеру.
 */
function isBuilderPath(path: string): boolean {
    return path === BUILDER_PATH_PREFIX || path.startsWith(`${BUILDER_PATH_PREFIX}/`);
}

/**
 * Выполняет `install` один раз при первом попадании на роут билдера: на начальной
 * загрузке (SSR и клиент — до рендера/гидрации, поэтому вызов нужно await'ить
 * из тела async-плагина) или в `beforeResolve` при SPA-переходе с published-страницы.
 * Тяжёлая часть плагина остаётся в lazy-чанке за `import()` и не попадает в бандл
 * published-страниц.
 *
 * @param install - Асинхронная установка тяжёлой части плагина.
 */
export async function runOnBuilderRoute(install: () => Promise<void>): Promise<void> {
    const router = useRouter();
    let isInstalled = false;

    /**
     * Однократно запускает install, если путь принадлежит билдеру.
     */
    async function ensureInstalled(path: string): Promise<void> {
        if (isInstalled || !isBuilderPath(path)) {
            return;
        }

        isInstalled = true;
        await install();
    }

    // SPA-переход на билдер с published-страницы; install await'ится до рендера
    router.beforeResolve(async (to) => {
        await ensureInstalled(to.path);
    });

    // Начальный URL запроса (router.currentRoute в момент плагина — ещё placeholder).
    // await блокирует bootstrap только на builder-роутах — published не задерживается.
    await ensureInstalled(useRequestURL().pathname);
}
