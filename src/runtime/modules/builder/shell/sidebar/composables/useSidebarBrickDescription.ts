// Vue
import { ref, watch } from 'vue';

// Pinia
import { useComponentsStore } from '../../../core/stores/components';

// Composables
import { useBrickImports } from '../../../../common/composables/useBrickImports';

// Constants
import { LAYOUT_COMPONENTS } from '../../../core/constants/layoutComponents';

/**
 * Описание выбранного компонента для панели свойств: загрузка из brick-файла
 * (или layout-конфига) с отслеживанием смены brickPath.
 */
export function useSidebarBrickDescription() {
    const store = useComponentsStore();
    const { findImportModule } = useBrickImports();

    const brickDescription = ref<string>('');

    /**
     * Загружает описание компонента из brick-файла (или из layout-конфига) для панели свойств.
     *
     * @param brickPath - Путь к brick (layout/* или путь к *.brick.ts)
     */
    async function loadBrickDescription(brickPath: string): Promise<void> {
        if (brickPath.startsWith('layout/')) {
            brickDescription.value =
                LAYOUT_COMPONENTS.find((item) => item.brickPath === brickPath)?.description || '';
            return;
        }

        const moduleLoader = findImportModule(brickPath);
        if (!moduleLoader) {
            brickDescription.value = '';
            return;
        }

        try {
            const module = await moduleLoader();
            brickDescription.value = (module?.brick?.description as string | undefined) || '';
        } catch (error) {
            console.error('[SidebarProperties] Failed to load brick description:', error);
            brickDescription.value = '';
        }
    }

    watch(
        () => store.selectedComponentData?.component?.brickPath,
        async (brickPath) => {
            if (!brickPath) {
                brickDescription.value = '';
                return;
            }

            await loadBrickDescription(brickPath);
        },
        { immediate: true }
    );

    return { brickDescription };
}
