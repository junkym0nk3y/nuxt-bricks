import { defineAsyncComponent, type Component } from 'vue';
import type { IRendererBrickResolverOptions } from '../types/render';
import { normalizeBrickPath } from '../../common/utils/bricks/paths';

const componentCache = new Map<string, Component | null>();

/**
 * Извлекает Vue-компонент из загруженного brick-модуля.
 *
 * @param module Brick-модуль с компонентом.
 * @param brickPath Путь до brick для логирования ошибок.
 * @returns Компонент или null.
 */
function extractBrickComponent(module: unknown, brickPath: string): Component | null {
    const exportedComponent = (module as Record<string, unknown>)?.Component;

    if (exportedComponent && typeof exportedComponent === 'object') {
        return exportedComponent as Component;
    }

    const component = (module as Record<string, unknown>)?.component;
    if (component && typeof component === 'object') {
        return component as Component;
    }

    if ((module as Record<string, unknown>)?.default) {
        return (module as Record<string, unknown>).default as Component;
    }

    console.error(`[TheRenderer] Module ${brickPath} has no usable component export`);
    return null;
}

/**
 * Загружает brick-модуль и кладёт его в кеш.
 *
 * Лоадер приходит уже найденным: вызывающий обязан проверить его наличие сам,
 * иначе отсутствие модуля обнаруживалось бы только внутри async-компонента, где
 * исключение не доходит до заглушки.
 *
 * @param brickPath Путь до brick-файла.
 * @param importModule Найденный loader brick-модуля.
 * @returns Компонент или null.
 */
async function loadBrickComponent(
    brickPath: string,
    importModule: () => Promise<unknown>
): Promise<Component | null> {
    const cacheKey = normalizeBrickPath(brickPath);

    try {
        const module = await importModule();
        const component = extractBrickComponent(module, brickPath);
        componentCache.set(cacheKey, component);
        return component;
    } catch (error) {
        console.error(`[TheRenderer] Failed to load component for ${brickPath}:`, error);
        // НЕ кэшируем null при ошибке — компонент может заработать после HMR
        return null;
    }
}

/**
 * Оборачивает загрузку brick-компонентов с кэшированием результатов.
 *
 * @param options - Опции, содержащие функцию поиска loader-а по пути brick.
 * @returns Утилиты для резолва brick-компонентов.
 */
export function useRendererBricks({ findImportModule }: IRendererBrickResolverOptions) {
    /**
     * Возвращает Vue-компонент по `brickPath`, используя динамический импорт.
     *
     * @param brickPath - Путь до `.brick.ts` файла.
     * @returns Загруженный компонент или `null`, если найти не удалось.
     */
    function resolveBrickComponent(brickPath: string): Component | null {
        if (!brickPath) {
            console.warn('[TheRenderer] Missing brickPath for component');
            return null;
        }

        const cacheKey = normalizeBrickPath(brickPath);

        if (componentCache.has(cacheKey)) {
            return componentCache.get(cacheKey) || null;
        }

        // Лоадер проверяется ДО создания async-компонента: внутри лоадера промах
        // превращался в исключение, оно доходило до SSR-рендера и роняло
        // published-страницу целиком в 500 (замерено на prod-сборке), вместе с
        // исправными компонентами схемы — то есть один устаревший brickPath
        // выносил всю страницу. Синхронный отказ доводит управление до ветки
        // заглушки в рендерере. Решение одинаково на сервере и клиенте: карта
        // лоадеров разворачивается из одного паттерна по одному набору файлов,
        // поэтому гидрация сходится.
        const importModule = findImportModule(brickPath);

        if (!importModule) {
            // О промахе сообщает сама точка поиска лоадера, один раз на путь;
            // НЕ кэшируем null — компонент может появиться после HMR
            return null;
        }

        const asyncComponent = defineAsyncComponent({
            loader: async () => {
                const component = await loadBrickComponent(brickPath, importModule);

                if (!component) {
                    throw new Error(`Module ${brickPath} has no usable component export`);
                }

                return component;
            },
            suspensible: true,
        });

        // Ключ нормализованный, как и у чтения выше: с сырым путём запись не
        // находилась, и на каждую перерисовку создавалась новая async-обёртка
        componentCache.set(cacheKey, asyncComponent);
        return asyncComponent;
    }

    /**
     * Предзагружает brick-компонент и кладёт его в общий кеш, чтобы избежать рассинхрона при гидрации.
     *
     * @param brickPath - Путь до brick-файла.
     */
    async function prefetchBrickComponent(brickPath: string): Promise<void> {
        if (!brickPath || brickPath.startsWith('layout')) {
            return;
        }

        const cacheKey = normalizeBrickPath(brickPath);

        if (componentCache.has(cacheKey)) {
            return;
        }

        const importModule = findImportModule(brickPath);

        // Нечего предзагружать: заглушку покажет рендер, предзагрузка молчит
        if (!importModule) {
            return;
        }

        await loadBrickComponent(brickPath, importModule);
    }

    return {
        resolveBrickComponent,
        prefetchBrickComponent,
    };
}
