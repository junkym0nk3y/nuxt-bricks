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
 * Manages the slots of a component: binds them to their children and picks the slot
 * definitions up from the manifest metadata when the schema does not carry them yet.
 *
 * @param componentId - Id of the component whose slots are managed
 * @param brickPath - Path to the brick file of the component
 * @param isLayout - Whether the component is a layout one
 * @param componentProps - Component props, the source of the string slot content
 * @returns Slot render data and the string content
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
     * Prepares the slot render data, binding every slot to its child components
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
     * Pulls the string content for the default slot out of the component props
     */
    const slotStringContent = computed<string>(() => {
        const source = componentProps || {};
        return typeof source.slot === 'string' ? source.slot : '';
    });
    // #endregion

    // #region Lifecycle
    // The slots of a component and the metadata of its brick are two independent
    // sources: the schema may already hold the slots, or it may be waiting for the
    // manifest. There is deliberately no "loading finished" flag here: while the index
    // holds no record, the question "does this brick have slots" has no answer, and
    // recording "it has none" would mean never picking them up after a retry succeeds
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
