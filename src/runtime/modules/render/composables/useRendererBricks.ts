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
 * @param brickPath Путь до brick-файла.
 * @param findImportModule Функция поиска loader-а.
 * @returns Компонент или null.
 */
async function loadBrickComponent(
    brickPath: string,
    findImportModule: (brickPath: string) => (() => Promise<unknown>) | undefined
): Promise<Component | null> {
    const cacheKey = normalizeBrickPath(brickPath);
    const importModule = findImportModule(brickPath);

    if (!importModule) {
        // О промахе сообщает сама точка поиска лоадера — второй лог на то же
        // событие только удваивал вывод на published-странице
        // НЕ кэшируем null — компонент может появиться после HMR
        return null;
    }

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

        const asyncComponent = defineAsyncComponent({
            loader: async () => {
                const component = await loadBrickComponent(brickPath, findImportModule);

                if (!component) {
                    throw new Error(`Module ${brickPath} has no usable component export`);
                }

                return component;
            },
            suspensible: true,
        });

        componentCache.set(brickPath, asyncComponent);
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

        await loadBrickComponent(brickPath, findImportModule);
    }

    return {
        resolveBrickComponent,
        prefetchBrickComponent,
    };
}
