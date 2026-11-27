/**
 * The device scope of the properties panel and the editors it locks.
 *
 * A component without adaptive properties has nothing to scope, and the panel shows it no
 * device tabs. It still took the canvas viewport for its scope: on any device but the base
 * one every field of such a brick was locked, every change was refused, and a rich text
 * editor, which draws no disabled state, swallowed the typing without a word. Separately,
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
const { stores, resetOverridesMock, updatePropMock, updateResponsivePropMock, openGalleryMock } =
    vi.hoisted(() => ({
        // Reactive objects are created inside the mock factories: `reactive()` called in
        // the hoisted block would reach for an import that has not been initialized yet
        stores: {} as {
            components: { selectedComponentData: unknown };
            canvas: { viewport: string; isFigmaMode: boolean; devices: unknown[] };
        },
        resetOverridesMock: vi.fn(),
        updatePropMock: vi.fn(),
        updateResponsivePropMock: vi.fn(),
        openGalleryMock: vi.fn(),
    }));

vi.mock('../../src/runtime/modules/builder/core/stores/components', async () => {
    const { reactive } = await import('vue');
    stores.components = reactive({
        selectedComponentData: null as unknown,
        resetComponentResponsivePropsForDevice: resetOverridesMock,
        updateComponentProp: updatePropMock,
        updateComponentResponsiveProp: updateResponsivePropMock,
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

vi.mock('vue-i18n', () => ({
    useI18n: () => ({ t: (key: string) => key, te: () => false }),
}));
// #endregion

import { useSidebarResponsiveScope } from '../../src/runtime/modules/builder/shell/sidebar/composables/useSidebarResponsiveScope';
import { useSidebarPropertiesPanel } from '../../src/runtime/modules/builder/shell/sidebar/composables/useSidebarPropertiesPanel';
import { normalizeVariantProps } from '../../src/runtime/modules/builder/shell/sidebar/utils/normalizeVariantProps';

// #region Data
const FIXED_PROPERTY: IPropertyDefinition = {
    name: 'title',
    type: 'input',
    label: 'title',
    default: '',
};

const FIXED_GALLERY_PROPERTY: IPropertyDefinition = {
    name: 'photos',
    type: 'image-gallery',
    label: 'photos',
    default: [],
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
 * Selects a brick component with the given properties.
 *
 * @param id - Id of the component on the canvas.
 * @param properties - Property definitions of the brick.
 */
function selectBrick(id: string, properties: IPropertyDefinition[]): void {
    stores.components.selectedComponentData = {
        id,
        component: { id, type: 'brick', componentName: 'Hero', props: {} },
        properties,
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

beforeEach(() => {
    stores.canvas.viewport = 'desktop';
    stores.canvas.isFigmaMode = false;
    stores.canvas.devices = [...DEVICES];
    resetOverridesMock.mockReset();
    updatePropMock.mockReset();
    updateResponsivePropMock.mockReset();
    openGalleryMock.mockReset();
});

describe('a component without adaptive properties', () => {
    it('is edited in its base props on any canvas device', async () => {
        selectBrick('brick-1', [FIXED_PROPERTY, FIXED_GALLERY_PROPERTY]);
        const panel = useSidebarPropertiesPanel({ onOpenMediaGallery: openGalleryMock });

        stores.canvas.viewport = 'mobile';
        await nextTick();

        const titleVariant = panel.componentVariants.value.input.find(
            (variant) => variant.property.name === 'title'
        );
        const galleryVariant = panel.componentVariants.value['image-gallery'].find(
            (variant) => variant.property.name === 'photos'
        );

        expect(titleVariant?.disabled).toBe(false);
        expect(galleryVariant?.disabled).toBe(false);
        expect(panel.hasLockedPropertiesForScope.value).toBe(false);

        panel.handleChangeValues(FIXED_PROPERTY, 'Mobile title');
        panel.handleOpenMediaGallery(FIXED_GALLERY_PROPERTY, { action: 'append' });

        expect(updatePropMock).toHaveBeenCalledWith('brick-1', 'title', 'Mobile title');
        expect(updateResponsivePropMock).not.toHaveBeenCalled();
        expect(openGalleryMock).toHaveBeenCalled();
    });

    it('takes the device of the canvas once adaptive properties arrive', async () => {
        // The pick keeps following the viewport while the component does not adapt: a
        // retried library load hands the properties in for the same selection, and the
        // scope has to be the device the person is looking at by then
        const { layoutDeviceScope } = useSidebarResponsiveScope();
        selectBrick('brick-2', [FIXED_PROPERTY]);
        await nextTick();

        stores.canvas.viewport = 'mobile';
        await nextTick();
        expect(layoutDeviceScope.value).toBe('desktop');

        selectBrick('brick-2', [ADAPTIVE_PROPERTY]);
        await nextTick();
        expect(layoutDeviceScope.value).toBe('mobile');
    });
});

describe('device scope of a component with adaptive properties', () => {
    it('follows the canvas viewport after the component was selected', async () => {
        stores.canvas.viewport = 'mobile';
        const { isResponsiveComponent, layoutDeviceScope } = useSidebarResponsiveScope();

        selectBrick('brick-3', [ADAPTIVE_PROPERTY]);
        await nextTick();

        expect(isResponsiveComponent.value).toBe(true);
        expect(layoutDeviceScope.value).toBe('mobile');

        stores.canvas.viewport = 'desktop';
        await nextTick();

        expect(layoutDeviceScope.value).toBe('desktop');
    });

    it('explains the locked fields on a device other than the base one', async () => {
        stores.canvas.viewport = 'mobile';
        const { hasLockedPropertiesForScope } = useSidebarResponsiveScope();

        selectBrick('brick-4', [ADAPTIVE_PROPERTY, FIXED_PROPERTY]);
        await nextTick();
        expect(hasLockedPropertiesForScope.value).toBe(true);

        stores.canvas.viewport = 'desktop';
        await nextTick();
        expect(hasLockedPropertiesForScope.value).toBe(false);
    });

    it('keeps the picked scope in Figma mode', async () => {
        stores.canvas.isFigmaMode = true;
        const { layoutDeviceScope, handleSetLayoutDeviceScope } = useSidebarResponsiveScope();

        selectBrick('brick-5', [ADAPTIVE_PROPERTY]);
        await nextTick();
        handleSetLayoutDeviceScope('mobile');

        stores.canvas.viewport = 'mobile';
        await nextTick();
        stores.canvas.viewport = 'desktop';
        await nextTick();

        expect(layoutDeviceScope.value).toBe('mobile');
    });
});

describe('device scope against the device set and the overrides', () => {
    it('falls back to the base device when the active one leaves the set', async () => {
        const { layoutDeviceScope, handleSetLayoutDeviceScope } = useSidebarResponsiveScope();
        selectBrick('brick-6', [ADAPTIVE_PROPERTY]);
        await nextTick();
        handleSetLayoutDeviceScope('mobile');

        stores.canvas.devices = [DEVICES[1]];
        await nextTick();

        expect(layoutDeviceScope.value).toBe('desktop');
    });

    it('keeps the active device while it stays in the set', async () => {
        const { layoutDeviceScope, handleSetLayoutDeviceScope } = useSidebarResponsiveScope();
        selectBrick('brick-7', [ADAPTIVE_PROPERTY]);
        await nextTick();
        handleSetLayoutDeviceScope('mobile');

        stores.canvas.devices = [...DEVICES, { key: 'tablet', label: 'Tablet', width: 768 }];
        await nextTick();

        expect(layoutDeviceScope.value).toBe('mobile');
    });

    it('drops the overrides of the picked device for an adaptive component', async () => {
        const { handleSetLayoutDeviceScope, handleResetLayoutDeviceScopeOverrides } =
            useSidebarResponsiveScope();
        selectBrick('brick-8', [ADAPTIVE_PROPERTY]);
        await nextTick();
        handleSetLayoutDeviceScope('mobile');

        handleResetLayoutDeviceScopeOverrides();

        expect(resetOverridesMock).toHaveBeenCalledWith('brick-8', 'mobile');
    });

    it('has nothing to drop on the base device or for a component that does not adapt', async () => {
        const { handleSetLayoutDeviceScope, handleResetLayoutDeviceScopeOverrides } =
            useSidebarResponsiveScope();

        selectBrick('brick-9', [ADAPTIVE_PROPERTY]);
        await nextTick();
        handleSetLayoutDeviceScope('desktop');
        handleResetLayoutDeviceScopeOverrides();

        selectBrick('brick-10', [FIXED_PROPERTY]);
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
