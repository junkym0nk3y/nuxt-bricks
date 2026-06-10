import type { ILandExportModule } from '../../types';
import { normalizeStoryPath } from '../utils/landing/paths';

/**
 * Приводит glob-результаты (eager/lazy) к единому виду: функция-лоадер Promise<Module>.
 *
 * @param modules Результат import.meta.glob.
 * @returns Карта loader-ов.
 */
function normalizeGlobLoaders(
    modules: Record<string, ILandExportModule | (() => Promise<ILandExportModule>)>
): Record<string, () => Promise<ILandExportModule>> {
    return Object.entries(modules).reduce<Record<string, () => Promise<ILandExportModule>>>(
        (acc, [path, loader]) => {
            if (typeof loader === 'function') {
                acc[path] = loader as () => Promise<ILandExportModule>;
                return acc;
            }

            acc[path] = () => Promise.resolve(loader as ILandExportModule);
            return acc;
        },
        {}
    );
}

/**
 * Подготавливает набор динамических импортов `.brick.ts` файлов как из локального проекта,
 * так и из sandbox/`node_modules`, предоставляя утилиты для поиска конкретного loader-а.
 *
 * @returns Объект с общей картой модулей и вспомогательными функциями поиска.
 */
export function useStoryImports() {
    // Глоб локальных компонентов проекта-потребителя (от его rootDir)
    const localModules = import.meta.glob<ILandExportModule>('/components/**/*.brick.ts');
    const localModulesSub = import.meta.glob<ILandExportModule>('/components/**/**/*.brick.ts');

    // Глоб для локальных layers
    const localLayersModules = import.meta.glob<ILandExportModule>('/layers/**/*.brick.ts');
    const localLayersModulesSub = import.meta.glob<ILandExportModule>('/layers/**/**/*.brick.ts');

    /**
     * Совокупная карта всех доступных через glob модулей. Ключи соответствуют путям,
     * которые возвращает Vite, значения — lazy loader-ы.
     */
    const allModules: Record<string, () => Promise<ILandExportModule>> = {
        ...normalizeGlobLoaders(localModules),
        ...normalizeGlobLoaders(localModulesSub),
        ...normalizeGlobLoaders(localLayersModules),
        ...normalizeGlobLoaders(localLayersModulesSub),
    };

    /**
     * Пытается подобрать соответствующий loader по исходному или нормализованному пути истории.
     * Если прямой ключ не найден, поочерёдно проверяются всевозможные вариации относительных путей.
     *
     * @param storyPath - Значение `storyPath`, сохранённое в схеме компонента.
     * @returns Функция-лоадер Vite или `undefined`, если найти файл не удалось.
     */
    function findImportModule(storyPath: string): (() => Promise<ILandExportModule>) | undefined {
        // Пропускаем встроенные layout-компоненты без story-файлов
        if (storyPath.startsWith('layout')) {
            // console.log('[useStoryImports] Skipping built-in layout:', storyPath);
            return undefined;
        }

        const normalizedPath = normalizeStoryPath(storyPath);

        // console.log('[useStoryImports] Looking for:', storyPath, 'normalized to:', normalizedPath);

        let importModule = allModules[normalizedPath] || allModules[storyPath];

        // If not found, try different path variations
        if (!importModule) {
            // console.warn(
            //     `[useStoryImports] Component not found in glob patterns: ${storyPath}, trying path variations...`
            // );

            // Generate flexible path variations
            const pathVariations = new Set([
                storyPath,
                normalizedPath,
                ...generatePathVariations(storyPath),
                ...generatePathVariations(normalizedPath),
            ]);
            // console.log('[useStoryImports] Generated path variations:', [...pathVariations]);

            for (const path of pathVariations) {
                const normalizedVariation = normalizeStoryPath(path);
                const loader = allModules[normalizedVariation] || allModules[path];

                if (loader) {
                    importModule = loader;
                    // console.log('[useStoryImports] Found module with path variation:', path);
                    break;
                }
            }

            // If still not found, log error
            if (!importModule) {
                console.error(
                    `[useStoryImports] Component not found in any glob patterns: ${storyPath}`
                );
                console.error('[useStoryImports] Available glob keys:', Object.keys(allModules));
            }
        }

        return importModule;
    }

    /**
     * Строит множество возможных путей до story-файла, исходя из оригинального значения,
     * чтобы повысить шанс найти совпадение с результатами `import.meta.glob`.
     *
     * @param originalPath - Исходный относительный путь из схемы.
     * @returns Уникальный список строк для последующей проверки.
     */
    function generatePathVariations(originalPath: string): string[] {
        const variations: string[] = [originalPath];

        // Get all possible glob patterns that could match this path
        const allGlobKeys = Object.keys(allModules);

        // Extract the base path without leading slashes/dots
        // eslint-disable-next-line no-useless-escape
        const basePath = originalPath.replace(/^[\.\/]+/, '');

        // Generate variations based on actual glob patterns found
        const possibleVariations = [
            // Original path
            originalPath,
            // With different prefixes
            `./${basePath}`,
            `/${basePath}`,
            `../${basePath}`,
            `../../${basePath}`,
            `../../../../${basePath}`,
            `../../../../../${basePath}`,
            // For node_modules specifically
            ...(basePath.includes('node_modules')
                ? [
                      `../node_modules/${basePath.replace(/^node_modules\//, '')}`,
                      `../../node_modules/${basePath.replace(/^node_modules\//, '')}`,
                      `../../../../node_modules/${basePath.replace(/^node_modules\//, '')}`,
                      `../../../../../node_modules/${basePath.replace(/^node_modules\//, '')}`,
                  ]
                : []),
        ];

        // Add all variations
        variations.push(...possibleVariations);

        // Also try to find exact matches in glob keys
        const exactMatches = allGlobKeys.filter(
            (key) => key.endsWith(basePath) || key.includes(basePath.replace(/^node_modules\//, ''))
        );
        variations.push(...exactMatches);

        // Remove duplicates and return
        return [...new Set(variations)];
    }

    return {
        allModules,
        findImportModule,
        generatePathVariations,
    };
}
