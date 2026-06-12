// #region Imports
// Types
import type { ComponentLibraryItem } from '../../../common/types/brick';

// Utils
import { extractStorySlots } from '../utils/storySlots';

// Vue
import { computed } from 'vue';

// Nuxt
import { useAsyncData } from '#imports';

// Composables
import { useApiClient } from '../../../common/composables/useApiClient';
import { useStoryImports } from '../../../common/composables/useStoryImports';

// Constants
import { LAYOUT_COMPONENTS } from '../../core/constants/layoutComponents';
// #endregion

/**
 * Загружает библиотеку компонентов: список stories с бэкенда + метаданные
 * из `.brick.ts`-модулей (defaultProps, slots) + layout-компоненты.
 */
export async function useComponentLibrary() {
    const { findImportModule } = useStoryImports();

    const componentLibrary = await useAsyncData<(ComponentLibraryItem | null)[] | null>(
        'bricks-components',
        async () => {
            const { apiFetcher } = useApiClient();
            const response = await apiFetcher<{ stories: any[] }>('/mock-api/bricks-components/');
            const stories = response?.stories || [];

            const componentsWithMeta = await Promise.all(
                stories.map(async (story: any) => {
                    try {
                        const moduleLoader = findImportModule(story.storyPath);
                        if (!moduleLoader) {
                            console.error(`[BricksBuilder] No loader for ${story.storyPath}`);
                            return null;
                        }

                        const module = await moduleLoader();
                        const storyData = module?.story || {};
                        const values = storyData.values || {};
                        const slots = extractStorySlots(storyData);
                        const defaultProps = Object.entries(values).reduce(
                            (acc: Record<string, unknown>, [key, val]: [string, any]) => {
                                acc[key] = val.default;
                                return acc;
                            },
                            {}
                        );

                        return {
                            name: story.name,
                            category: story.category || storyData.category || 'Other',
                            storyPath: story.storyPath,
                            description: storyData.description,
                            thumbnail: '',
                            defaultProps,
                            slots,
                        } as ComponentLibraryItem;
                    } catch (error) {
                        console.error(`[BricksBuilder] Failed loading ${story.name}`, error);
                        return null;
                    }
                })
            );

            return [...LAYOUT_COMPONENTS, ...componentsWithMeta.filter(Boolean)];
        }
    );

    const componentLibraryList = computed<ComponentLibraryItem[]>(() => {
        const list = componentLibrary.data.value;
        return (Array.isArray(list) ? list : []).filter(Boolean) as ComponentLibraryItem[];
    });

    return { componentLibraryList };
}
