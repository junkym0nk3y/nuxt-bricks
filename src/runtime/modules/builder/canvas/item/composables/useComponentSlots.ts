// #region Imports
// Types
import type { IBricksComponent } from '../../../../common/types/brick';
import type { ISlotRenderData, IUseComponentSlotsReturn } from '../../types/composables';

// Vue
import { computed, watch } from 'vue';

// Pinia
import { useComponentsStore } from '../../../core/stores/components';

// Composables
import { useBrickMetadata } from '../../../core/composables/useBrickMetadata';
// #endregion

/**
 * Composable для управления слотами компонента.
 * Связывает слоты компонента с их дочерними элементами и добирает определения
 * слотов из метаданных манифеста, если в схеме их ещё нет.
 *
 * @param componentId - ID компонента для управления слотами
 * @param brickPath - Путь к brick-файлу компонента
 * @param isLayout - Является ли компонент layout-компонентом
 * @param componentProps - Пропсы компонента для извлечения строкового контента слота
 * @returns Объект с данными для рендеринга слотов и строковым контентом
 */
export function useComponentSlots(
    componentId: string,
    brickPath: string,
    isLayout: boolean,
    componentProps: Record<string, unknown> | undefined
): IUseComponentSlotsReturn {
    // #region Data
    const componentsStore = useComponentsStore();
    const { readBrickMetadata } = useBrickMetadata();
    // #endregion

    // #region Computed
    /**
     * Подготавливает данные для рендеринга слотов, связывая слоты с их дочерними компонентами
     */
    const slotRenderData = computed<ISlotRenderData[]>(() => {
        const component = componentsStore.getComponentById(componentId);
        if (!component) {
            return [];
        }

        const slots = component.slots;
        if (!Array.isArray(slots) || slots.length === 0) {
            return [];
        }

        return slots.map((slot) => ({
            slot,
            children: slot.children
                .map((childId) => componentsStore.getComponentById(childId))
                .filter(Boolean) as IBricksComponent[],
        }));
    });

    /**
     * Извлекает строковый контент из пропсов компонента для дефолтного слота
     */
    const slotStringContent = computed<string>(() => {
        const source = componentProps || {};
        return typeof source.slot === 'string' ? source.slot : '';
    });
    // #endregion

    // #region Lifecycle
    // Слоты компонента и метаданные его брика — два независимых источника: в
    // схеме слоты могут быть уже сохранены, а могут ждать манифеста. Признака
    // «загрузка закончена» здесь нет намеренно: пока записи в индексе нет,
    // вопрос «есть ли у брика слоты» остаётся без ответа, и зафиксировать
    // «слотов нет» значило бы не добрать их после удачного повтора загрузки
    watch(
        () => ({
            slots: componentsStore.getComponentById(componentId)?.slots,
            definitions: isLayout ? undefined : readBrickMetadata(brickPath)?.slots,
        }),
        ({ slots, definitions }) => {
            const hasSchemaSlots = Array.isArray(slots) && slots.length > 0;

            if (hasSchemaSlots || !definitions?.length) {
                return;
            }

            componentsStore.initializeComponentSlots(componentId, definitions);
        },
        { immediate: true }
    );
    // #endregion

    return {
        slotRenderData,
        slotStringContent,
    };
}
