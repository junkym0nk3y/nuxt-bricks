import { defineAsyncComponent, type Component } from 'vue';
import type { ILandingRendererStoryResolverOptions } from '../types/render';
import { normalizeStoryPath } from '../../common/utils/landing/paths';

const componentCache = new Map<string, Component | null>();

/**
 * Очищает кэш компонентов. Вызывается при HMR для сброса закэшированных null-значений.
 */
export function clearComponentCache(): void {
    componentCache.clear();
}

/**
 * Удаляет конкретный компонент из кэша по storyPath.
 */
export function invalidateCachedComponent(storyPath: string): void {
    const cacheKey = normalizeStoryPath(storyPath);
    componentCache.delete(cacheKey);
}

/**
 * Извлекает Vue-компонент из загруженного story-модуля.
 *
 * @param module Story-модуль с компонентом.
 * @param storyPath Путь до story для логирования ошибок.
 * @returns Компонент или null.
 */
function extractStoryComponent(module: unknown, storyPath: string): Component | null {
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

    console.error(`[TheRenderer] Module ${storyPath} has no usable component export`);
    return null;
}

/**
 * Загружает story-модуль и кладёт его в кеш.
 *
 * @param storyPath Путь до story-файла.
 * @param findImportModule Функция поиска loader-а.
 * @returns Компонент или null.
 */
async function loadStoryComponent(
    storyPath: string,
    findImportModule: (storyPath: string) => (() => Promise<unknown>) | undefined
): Promise<Component | null> {
    const cacheKey = normalizeStoryPath(storyPath);
    const importModule = findImportModule(storyPath);

    if (!importModule) {
        console.warn('[TheRenderer] No story module found for:', storyPath);
        // НЕ кэшируем null — компонент может появиться после HMR
        return null;
    }

    try {
        const module = await importModule();
        const component = extractStoryComponent(module, storyPath);
        componentCache.set(cacheKey, component);
        return component;
    } catch (error) {
        console.error(`[TheRenderer] Failed to load component for ${storyPath}:`, error);
        // НЕ кэшируем null при ошибке — компонент может заработать после HMR
        return null;
    }
}

/**
 * Оборачивает загрузку story-компонентов с кэшированием результатов.
 *
 * @param options - Опции, содержащие функцию поиска loader-а по пути story.
 * @returns Утилиты для резолва story-компонентов.
 */
export function useRendererStories({
    findImportModule,
}: ILandingRendererStoryResolverOptions) {
    /**
     * Возвращает Vue-компонент по `storyPath`, используя динамический импорт.
     *
     * @param storyPath - Путь до `.brick.ts` файла.
     * @returns Загруженный компонент или `null`, если найти не удалось.
     */
    function resolveStoryComponent(storyPath: string): Component | null {
        if (!storyPath) {
            console.warn('[TheRenderer] Missing storyPath for component');
            return null;
        }

        const cacheKey = normalizeStoryPath(storyPath);

        if (componentCache.has(cacheKey)) {
            return componentCache.get(cacheKey) || null;
        }

        const asyncComponent = defineAsyncComponent({
            loader: async () => {
                const component = await loadStoryComponent(storyPath, findImportModule);

                if (!component) {
                    throw new Error(`Module ${storyPath} has no usable component export`);
                }

                return component;
            },
            suspensible: true,
        });

        componentCache.set(storyPath, asyncComponent);
        return asyncComponent;
    }

    /**
     * Предзагружает story-компонент и кладёт его в общий кеш, чтобы избежать рассинхрона при гидрации.
     *
     * @param storyPath - Путь до story-файла.
     */
    async function prefetchStoryComponent(storyPath: string): Promise<void> {
        if (!storyPath || storyPath.startsWith('layout')) {
            return;
        }

        const cacheKey = normalizeStoryPath(storyPath);

        if (componentCache.has(cacheKey)) {
            return;
        }

        await loadStoryComponent(storyPath, findImportModule);
    }

    return {
        resolveStoryComponent,
        prefetchStoryComponent,
    };
}
