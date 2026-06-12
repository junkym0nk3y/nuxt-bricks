import type { IBrickExportModule } from '../types/index';
import { normalizeBrickPath } from '../utils/bricks/paths';

/**
 * Приводит glob-результаты (eager/lazy) к единому виду: функция-лоадер Promise<Module>.
 *
 * @param modules Результат import.meta.glob.
 * @returns Карта loader-ов.
 */
function normalizeGlobLoaders(
    modules: Record<string, IBrickExportModule | (() => Promise<IBrickExportModule>)>
): Record<string, () => Promise<IBrickExportModule>> {
    return Object.entries(modules).reduce<Record<string, () => Promise<IBrickExportModule>>>(
        (acc, [path, loader]) => {
            if (typeof loader === 'function') {
                acc[path] = loader as () => Promise<IBrickExportModule>;
                return acc;
            }

            acc[path] = () => Promise.resolve(loader as IBrickExportModule);
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
export function useBrickImports() {
    // Глоб локальных компонентов проекта-потребителя (от его rootDir)
    const localModules = import.meta.glob<IBrickExportModule>('/components/**/*.brick.ts');
    const localModulesSub = import.meta.glob<IBrickExportModule>('/components/**/**/*.brick.ts');

    // Глоб для локальных layers
    const localLayersModules = import.meta.glob<IBrickExportModule>('/layers/**/*.brick.ts');
    const localLayersModulesSub = import.meta.glob<IBrickExportModule>('/layers/**/**/*.brick.ts');

    /**
     * Совокупная карта всех доступных через glob модулей. Ключи соответствуют путям,
     * которые возвращает Vite, значения — lazy loader-ы.
     */
    const allModules: Record<string, () => Promise<IBrickExportModule>> = {
        ...normalizeGlobLoaders(localModules),
        ...normalizeGlobLoaders(localModulesSub),
        ...normalizeGlobLoaders(localLayersModules),
        ...normalizeGlobLoaders(localLayersModulesSub),
    };

    /**
     * Пытается подобрать соответствующий loader по исходному или нормализованному пути истории.
     * Если прямой ключ не найден, поочерёдно проверяются всевозможные вариации относительных путей.
     *
     * @param brickPath - Значение `brickPath`, сохранённое в схеме компонента.
     * @returns Функция-лоадер Vite или `undefined`, если найти файл не удалось.
     */
    function findImportModule(brickPath: string): (() => Promise<IBrickExportModule>) | undefined {
        // Пропускаем встроенные layout-компоненты без brick-файлов
        if (brickPath.startsWith('layout')) {
            // console.log('[useBrickImports] Skipping built-in layout:', brickPath);
            return undefined;
        }

        const normalizedPath = normalizeBrickPath(brickPath);

        // console.log('[useBrickImports] Looking for:', brickPath, 'normalized to:', normalizedPath);

        let importModule = allModules[normalizedPath] || allModules[brickPath];

        // If not found, try different path variations
        if (!importModule) {
            // console.warn(
            //     `[useBrickImports] Component not found in glob patterns: ${brickPath}, trying path variations...`
            // );

            // Generate flexible path variations
            const pathVariations = new Set([
                brickPath,
                normalizedPath,
                ...generatePathVariations(brickPath),
                ...generatePathVariations(normalizedPath),
            ]);
            // console.log('[useBrickImports] Generated path variations:', [...pathVariations]);

            for (const path of pathVariations) {
                const normalizedVariation = normalizeBrickPath(path);
                const loader = allModules[normalizedVariation] || allModules[path];

                if (loader) {
                    importModule = loader;
                    // console.log('[useBrickImports] Found module with path variation:', path);
                    break;
                }
            }

            // If still not found, log error
            if (!importModule) {
                console.error(
                    `[useBrickImports] Component not found in any glob patterns: ${brickPath}`
                );
                console.error('[useBrickImports] Available glob keys:', Object.keys(allModules));
            }
        }

        return importModule;
    }

    /**
     * Строит множество возможных путей до brick-файла, исходя из оригинального значения,
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
