// Vue
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';

// Pinia
import { useComponentsStore } from '../../../core/stores/components';

// Composables
import { useBrickImports } from '../../../../common/composables/useBrickImports';

// Utils
import { resolveBricksLabel } from '../../../../common/utils/i18nLabels';

// Constants
import { LAYOUT_COMPONENTS } from '../../../core/constants/layoutComponents';

/**
 * Описание выбранного компонента для панели свойств: загрузка из brick-файла
 * (или layout-конфига) с отслеживанием смены brickPath.
 */
export function useSidebarBrickDescription() {
    const store = useComponentsStore();
    const { findImportModule } = useBrickImports();
    const { t, te } = useI18n();

    const rawDescription = ref<string>('');

    /**
     * Описание с i18n-резолвом: ключи `bricks.*` (layout-блоки) переводятся,
     * кастомные строки brick-файлов потребителя — как есть.
     */
    const brickDescription = computed<string>(
        () => resolveBricksLabel(t, te, rawDescription.value) || ''
    );

    /**
     * Загружает описание компонента из brick-файла (или из layout-конфига) для панели свойств.
     *
     * @param brickPath - Путь к brick (layout/* или путь к *.brick.ts)
     */
    async function loadBrickDescription(brickPath: string): Promise<void> {
        if (brickPath.startsWith('layout/')) {
            rawDescription.value =
                LAYOUT_COMPONENTS.find((item) => item.brickPath === brickPath)?.description || '';
            return;
        }

        const moduleLoader = findImportModule(brickPath);
        if (!moduleLoader) {
            rawDescription.value = '';
            return;
        }

        try {
            const module = await moduleLoader();
            rawDescription.value = (module?.brick?.description as string | undefined) || '';
        } catch (error) {
            console.error('[SidebarProperties] Failed to load brick description:', error);
            rawDescription.value = '';
        }
    }

    watch(
        () => store.selectedComponentData?.component?.brickPath,
        async (brickPath) => {
            if (!brickPath) {
                rawDescription.value = '';
                return;
            }

            await loadBrickDescription(brickPath);
        },
        { immediate: true }
    );

    return { brickDescription };
}
