// #region Imports
// Types
import type { IComponentLibraryItem } from '../../../common/types/brick';
import type { IBrickValues } from '../../../common/types/index';
import type { IBricksResponse, IBrickListItem } from '../types/composables';

// Utils
import { extractBrickSlots } from '../utils/brickSlots';

// Vue
import { computed } from 'vue';

// Nuxt
import { useAsyncData } from '#imports';

// Composables
import { useApiClient } from '../../../common/composables/useApiClient';
import { useBrickImports } from '../../../common/composables/useBrickImports';

// Constants
import { LAYOUT_COMPONENTS } from '../../core/constants/layoutComponents';
// #endregion

/**
 * Загружает библиотеку компонентов: список bricks с бэкенда + метаданные
 * из `.brick.ts`-модулей (defaultProps, slots) + layout-компоненты.
 */
export async function useComponentLibrary() {
    const { findImportModule } = useBrickImports();

    const componentLibrary = await useAsyncData<(IComponentLibraryItem | null)[] | null>(
        'bricks-components',
        async () => {
            const { apiFetcher } = useApiClient();
            const response = await apiFetcher<IBricksResponse>('/mock-api/bricks-components/');
            const bricks = response?.bricks || [];

            const componentsWithMeta = await Promise.all(
                bricks.map(async (brick: IBrickListItem) => {
                    try {
                        const moduleLoader = findImportModule(brick.brickPath);
                        if (!moduleLoader) {
                            console.error(`[BricksBuilder] No loader for ${brick.brickPath}`);
                            return null;
                        }

                        const module = await moduleLoader();
                        const brickData = module?.brick;
                        const values = brickData?.values || {};
                        const slots = extractBrickSlots(brickData);
                        const defaultProps = Object.entries(values).reduce(
                            (acc: Record<string, unknown>, [key, val]: [string, IBrickValues]) => {
                                acc[key] = val.default;
                                return acc;
                            },
                            {}
                        );

                        return {
                            name: brick.name,
                            category: brick.category || brickData?.category || 'Other',
                            brickPath: brick.brickPath,
                            description: brickData?.description,
                            thumbnail: '',
                            defaultProps,
                            slots,
                        } as IComponentLibraryItem;
                    } catch (error) {
                        console.error(`[BricksBuilder] Failed loading ${brick.name}`, error);
                        return null;
                    }
                })
            );

            return [...LAYOUT_COMPONENTS, ...componentsWithMeta.filter(Boolean)];
        }
    );

    const componentLibraryList = computed<IComponentLibraryItem[]>(() => {
        const list = componentLibrary.data.value;
        return (Array.isArray(list) ? list : []).filter(Boolean) as IComponentLibraryItem[];
    });

    return { componentLibraryList };
}
