// Vue
import { ref, watch } from 'vue';

// Pinia
import { useComponentsStore } from '../../../core/stores/components';

// Composables
import { useStoryImports } from '../../../../common/composables/useStoryImports';

// Constants
import { LAYOUT_COMPONENTS } from '../../../core/constants/layoutComponents';

/**
 * Описание выбранного компонента для панели свойств: загрузка из story-файла
 * (или layout-конфига) с отслеживанием смены storyPath.
 */
export function useStoryDescription() {
    const store = useComponentsStore();
    const { findImportModule } = useStoryImports();

    const storyDescription = ref<string>('');

    /**
     * Загружает описание компонента из story-файла (или из layout-конфига) для панели свойств.
     *
     * @param storyPath - Путь к story (layout/* или путь к *.brick.ts)
     */
    async function loadStoryDescription(storyPath: string): Promise<void> {
        if (storyPath.startsWith('layout/')) {
            storyDescription.value =
                LAYOUT_COMPONENTS.find((item) => item.storyPath === storyPath)?.description || '';
            return;
        }

        const moduleLoader = findImportModule(storyPath);
        if (!moduleLoader) {
            storyDescription.value = '';
            return;
        }

        try {
            const module = await moduleLoader();
            storyDescription.value = (module?.story?.description as string | undefined) || '';
        } catch (error) {
            console.error('[SidebarProperties] Failed to load story description:', error);
            storyDescription.value = '';
        }
    }

    watch(
        () => store.selectedComponentData?.component?.storyPath,
        async (storyPath) => {
            if (!storyPath) {
                storyDescription.value = '';
                return;
            }

            await loadStoryDescription(storyPath);
        },
        { immediate: true }
    );

    return { storyDescription };
}
