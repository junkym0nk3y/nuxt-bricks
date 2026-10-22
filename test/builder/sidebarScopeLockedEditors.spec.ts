/**
 * The device scope of the properties panel and the editors it locks.
 *
 * A component without adaptive properties kept the device it was selected under: the
 * selection set the scope from the canvas viewport, while a viewport switch moved it only
 * for responsive components. Selected on Mobile and edited back on Desktop, such a
 * component had every change refused as "locked on this device", silently. Separately,
 * the select and the switch lost `disabled` in normalization, so a locked property looked
 * editable there and the pick just vanished.
 */

// #region Imports
// Types
import type { IComponentVariant } from '../../src/runtime/modules/builder/shell/sidebar/components/property-editors/types';
import type { IPropertyDefinition } from '../../src/runtime/modules/common/types/brick';

// Vitest
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Vue
import { nextTick } from 'vue';
// #endregion

// #region Mocks
const { stores, resetOverridesMock } = vi.hoisted(() => ({
    // Reactive objects are created inside the mock factories: `reactive()` called in
    // the hoisted block would reach for an import that has not been initialized yet
    stores: {} as {
        components: { selectedComponentData: unknown };
        canvas: { viewport: string; isFigmaMode: boolean; devices: unknown[] };
    },
    resetOverridesMock: vi.fn(),
}));

vi.mock('../../src/runtime/modules/builder/core/stores/components', async () => {
    const { reactive } = await import('vue');
    stores.components = reactive({
        selectedComponentData: null as unknown,
        resetComponentResponsivePropsForDevice: resetOverridesMock,
    });

    return { useComponentsStore: () => stores.components };
});

vi.mock('../../src/runtime/modules/builder/core/stores/canvas', async () => {
    const { reactive } = await import('vue');
    stores.canvas = reactive({
        viewport: 'desktop',
        isFigmaMode: false,
        devices: [
            { key: 'mobile', label: 'Mobile', width: 375 },
            { key: 'desktop', label: 'Desktop', width: 1600 },
        ],
    });

    return { useCanvasStore: () => stores.canvas };
});
// #endregion

import { useSidebarResponsiveScope } from '../../src/runtime/modules/builder/shell/sidebar/composables/useSidebarResponsiveScope';
import { normalizeVariantProps } from '../../src/runtime/modules/builder/shell/sidebar/utils/normalizeVariantProps';

// #region Data
const FIXED_PROPERTY: IPropertyDefinition = {
    name: 'title',
    type: 'input',
    label: 'title',
    default: '',
};

const ADAPTIVE_PROPERTY: IPropertyDefinition = {
    name: 'size',
    type: 'input',
    label: 'size',
    default: '',
    responsive: true,
};

const DEVICES = [
    { key: 'mobile', label: 'Mobile', width: 375 },
    { key: 'desktop', label: 'Desktop', width: 1600 },
];
// #endregion

// #region Methods
/**
 * Selects a brick component whose properties have no `responsive` flag.
 *
 * @param id - Id of the component on the canvas.
 */
function selectFixedBrick(id: string): void {
    stores.components.selectedComponentData = {
        id,
        component: { id, type: 'brick', componentName: 'Hero', props: {} },
        properties: [FIXED_PROPERTY],
    };
}

/**
 * Selects a brick component with an adaptive property.
 *
 * @param id - Id of the component on the canvas.
 */
function selectAdaptiveBrick(id: string): void {
    stores.components.selectedComponentData = {
        id,
        component: { id, type: 'brick', componentName: 'Hero', props: {} },
        properties: [ADAPTIVE_PROPERTY],
    };
}

/**
 * Builds a property variant locked on the current device tab.
 *
 * @param overrides - Fields specific to the editor kind.
 * @returns The variant as the panel hands it to the editor row.
 */
function lockedVariant(overrides: Partial<IComponentVariant>): IComponentVariant {
    return {
        label: 'Variant',
        value: 'a',
        disabled: true,
        property: FIXED_PROPERTY,
        ...overrides,
    };
}
// #endregion

describe('device scope of a component without adaptive properties', () => {
    it('follows the canvas viewport after the component was selected', async () => {
        stores.canvas.viewport = 'mobile';
        const { isResponsiveComponent, layoutDeviceScope } = useSidebarResponsiveScope();

        selectFixedBrick('brick-1');
        await nextTick();

        expect(isResponsiveComponent.value).toBe(false);
        expect(layoutDeviceScope.value).toBe('mobile');

        stores.canvas.viewport = 'desktop';
        await nextTick();

        expect(layoutDeviceScope.value).toBe('desktop');
    });

    it('explains the locked fields on a device other than the base one', async () => {
        stores.canvas.viewport = 'mobile';
        const { hasLockedPropertiesForScope } = useSidebarResponsiveScope();

        selectFixedBrick('brick-6');
        await nextTick();
        expect(hasLockedPropertiesForScope.value).toBe(true);

        stores.canvas.viewport = 'desktop';
        await nextTick();
        expect(hasLockedPropertiesForScope.value).toBe(false);
    });

    it('keeps the picked scope in Figma mode', async () => {
        stores.canvas.viewport = 'desktop';
        stores.canvas.isFigmaMode = true;
        const { layoutDeviceScope, handleSetLayoutDeviceScope } = useSidebarResponsiveScope();

        selectFixedBrick('brick-2');
        await nextTick();
        handleSetLayoutDeviceScope('mobile');

        stores.canvas.viewport = 'mobile';
        await nextTick();
        stores.canvas.viewport = 'desktop';
        await nextTick();

        expect(layoutDeviceScope.value).toBe('mobile');
        stores.canvas.isFigmaMode = false;
    });
});

describe('device scope against the device set and the overrides', () => {
    beforeEach(() => {
        stores.canvas.viewport = 'desktop';
        stores.canvas.devices = [...DEVICES];
        resetOverridesMock.mockReset();
    });

    it('falls back to the base device when the active one leaves the set', async () => {
        const { layoutDeviceScope, handleSetLayoutDeviceScope } = useSidebarResponsiveScope();
        handleSetLayoutDeviceScope('mobile');

        stores.canvas.devices = [DEVICES[1]];
        await nextTick();

        expect(layoutDeviceScope.value).toBe('desktop');
    });

    it('keeps the active device while it stays in the set', async () => {
        const { layoutDeviceScope, handleSetLayoutDeviceScope } = useSidebarResponsiveScope();
        handleSetLayoutDeviceScope('mobile');

        stores.canvas.devices = [...DEVICES, { key: 'tablet', label: 'Tablet', width: 768 }];
        await nextTick();

        expect(layoutDeviceScope.value).toBe('mobile');
    });

    it('drops the overrides of the picked device for an adaptive component', async () => {
        const { handleSetLayoutDeviceScope, handleResetLayoutDeviceScopeOverrides } =
            useSidebarResponsiveScope();
        selectAdaptiveBrick('brick-3');
        await nextTick();
        handleSetLayoutDeviceScope('mobile');

        handleResetLayoutDeviceScopeOverrides();

        expect(resetOverridesMock).toHaveBeenCalledWith('brick-3', 'mobile');
    });

    it('has nothing to drop on the base device or for a component that does not adapt', async () => {
        const { handleSetLayoutDeviceScope, handleResetLayoutDeviceScopeOverrides } =
            useSidebarResponsiveScope();

        selectAdaptiveBrick('brick-4');
        await nextTick();
        handleSetLayoutDeviceScope('desktop');
        handleResetLayoutDeviceScopeOverrides();

        selectFixedBrick('brick-5');
        await nextTick();
        handleSetLayoutDeviceScope('mobile');
        handleResetLayoutDeviceScopeOverrides();

        expect(resetOverridesMock).not.toHaveBeenCalled();
    });
});

describe('locked editors stay visibly locked', () => {
    it('a select carries disabled', () => {
        const props = normalizeVariantProps(
            lockedVariant({ specs: [{ label: 'A', value: 'a' }], facets: ['a'] })
        );

        expect(props.disabled).toBe(true);
    });

    it('a switch carries disabled', () => {
        const props = normalizeVariantProps(lockedVariant({ trueValue: 'on', falseValue: 'off' }));

        expect(props.disabled).toBe(true);
    });
});
