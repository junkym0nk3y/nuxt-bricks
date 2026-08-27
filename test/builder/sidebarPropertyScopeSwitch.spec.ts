/**
 * @vitest-environment happy-dom
 *
 * Switching the device scope of the properties panel drops what the editors of the
 * previous scope were holding.
 *
 * The reason is a value that stays the same. A scope with no override of its own shows
 * the INHERITED value, so an editor comparing "did the value change" sees nothing
 * happen — while the panel is now writing into another scope. An editor with a draft
 * of its own (the JSON field is the one: it keeps text that does not parse and emits
 * nothing until it does) would carry the unfinished text across the switch and put it
 * into the new scope on the first keystroke that parses. The scope is part of the key
 * of every row so that cannot happen.
 */

// #region Imports
// Vitest
import { describe, expect, it, vi } from 'vitest';

// Types
import {
    PROPERTY_EDITOR_ORDER,
    type IComponentVariant,
    type TComponentVariantsMap,
    type TPropertyEditorType,
} from '../../src/runtime/modules/builder/shell/sidebar/components/property-editors/types';

// Vue
import { defineComponent, h, markRaw, type Component } from 'vue';
import { mount } from '@vue/test-utils';
// #endregion

// #region Mocks
const { canvasStoreMock } = vi.hoisted(() => ({
    canvasStoreMock: {
        devices: [
            { key: 'mobile', label: 'Mobile' },
            { key: 'desktop', label: 'Desktop' },
        ],
    },
}));

vi.mock('../../src/runtime/modules/builder/core/stores/canvas', () => ({
    useCanvasStore: () => canvasStoreMock,
}));

vi.mock('vue-i18n', () => ({
    useI18n: () => ({ t: (key: string) => key, te: () => false }),
}));
// #endregion

import BuilderShellSidebarPropertyEditors from '../../src/runtime/modules/builder/shell/sidebar/components/BuilderShellSidebarPropertyEditors.vue';
import BuilderShellSidebarPropertyJsonEditor from '../../src/runtime/modules/builder/shell/sidebar/components/property-editors/BuilderShellSidebarPropertyJsonEditor.vue';

// #region Data
/** The property the panel shows: an object one, that is the JSON editor */
const JSON_VARIANT: IComponentVariant = {
    label: 'Payload',
    value: { a: 1 } as never,
    disabled: false,
    property: {
        name: 'payload',
        type: 'object',
        label: 'Payload',
        responsive: true,
    } as never,
};

const NoopEditor = markRaw(
    defineComponent({
        name: 'NoopEditor',
        setup: () => () => h('div'),
    })
);

const EDITOR_STUBS = PROPERTY_EDITOR_ORDER.reduce(
    (map, type) => ({ ...map, [type]: NoopEditor }),
    {} as Record<TPropertyEditorType, Component>
) as Record<TPropertyEditorType, Component>;
EDITOR_STUBS.json = markRaw(BuilderShellSidebarPropertyJsonEditor);

const VARIANTS = PROPERTY_EDITOR_ORDER.reduce(
    (map, type) => ({ ...map, [type]: type === 'json' ? [JSON_VARIANT] : [] }),
    {} as TComponentVariantsMap
);
// #endregion

// #region Methods
/**
 * Mounts the panel over one object property in the given scope.
 *
 * @param deviceScope - The device scope the panel shows values for.
 */
function mountPanel(deviceScope: 'desktop' | 'mobile') {
    return mount(BuilderShellSidebarPropertyEditors, {
        props: {
            componentEditors: EDITOR_STUBS,
            componentVariants: VARIANTS,
            deviceScope,
            fullWidthValue: false,
            showFullWidthControl: false,
            isHiddenValue: false,
            deviceVisibilityValue: {},
            handleToggleFullWidth: vi.fn(),
            handleToggleHidden: vi.fn(),
            handleToggleDeviceVisibility: vi.fn(),
            htmlIdValue: '',
            handleSetHtmlId: vi.fn(),
            handleChangeValues: vi.fn(),
            handleOpenMediaGallery: vi.fn(),
        },
        global: { stubs: { BricksInput: true } },
    });
}
// #endregion

describe('properties panel: switching the device scope', () => {
    it('drops an unfinished json draft instead of carrying it into the new scope', async () => {
        const wrapper = mountPanel('desktop');
        const field = wrapper.get('textarea');

        (field.element as HTMLTextAreaElement).value = '{"a": 1, "b":';
        await field.trigger('input');

        expect((wrapper.get('textarea').element as HTMLTextAreaElement).value).toBe(
            '{"a": 1, "b":'
        );

        // The value of the property does not change: mobile inherits it from desktop
        await wrapper.setProps({ deviceScope: 'mobile' });

        expect((wrapper.get('textarea').element as HTMLTextAreaElement).value).toBe(
            JSON.stringify({ a: 1 }, null, 2)
        );
        expect(wrapper.find('[role="alert"]').exists()).toBe(false);
    });
});
