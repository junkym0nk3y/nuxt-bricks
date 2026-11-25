/**
 * @vitest-environment happy-dom
 *
 * The row of the properties panel hands its editor the `type` the editor needs: the kind
 * of a media picker, the input type of a text field. The input type used to be bound as an
 * attribute after `v-bind`, which won over the props object and handed every other editor
 * `undefined` — the picker of a video or a file property fell back to its `image` default
 * and drew the address into an `<img>`.
 */

// #region Imports
// Vitest
import { describe, expect, it, vi } from 'vitest';

// Types
import type { TPropertyType } from '../../src/runtime/modules/common/types/brick';
import {
    PROPERTY_EDITOR_ORDER,
    type IComponentVariant,
    type TPropertyEditorType,
} from '../../src/runtime/modules/builder/shell/sidebar/components/property-editors/types';

// Vue
import { defineComponent, h, markRaw, type Component } from 'vue';
import { mount } from '@vue/test-utils';
// #endregion

// #region Mocks
vi.mock('vue-i18n', () => ({
    useI18n: () => ({ t: (key: string) => key, te: () => false }),
}));
// #endregion

import BuilderShellSidebarPropertyEditorRow from '../../src/runtime/modules/builder/shell/sidebar/components/BuilderShellSidebarPropertyEditorRow.vue';

// #region Data
/** Editor that shows the `type` it was given */
const EditorStub = markRaw(
    defineComponent({
        name: 'EditorStub',
        props: { type: { type: String, default: 'unset' } },
        setup: (props) => () => h('div', { 'data-test': 'editor' }, props.type),
    })
);

const EDITOR_STUBS = PROPERTY_EDITOR_ORDER.reduce(
    (map, type) => ({ ...map, [type]: EditorStub }),
    {} as Record<TPropertyEditorType, Component>
);
// #endregion

// #region Methods
/**
 * The `type` the editor of a row receives.
 *
 * @param editorType - The editor type of the row.
 * @param propertyType - The type of the property behind it.
 * @returns What the editor shows.
 */
function readEditorType(editorType: TPropertyEditorType, propertyType: TPropertyType): string {
    const variant: IComponentVariant = {
        label: 'Field',
        value: '',
        disabled: false,
        property: { name: 'field', type: propertyType, label: 'Field', default: '' },
    };

    return mount(BuilderShellSidebarPropertyEditorRow, {
        props: {
            type: editorType,
            variant,
            componentEditors: EDITOR_STUBS,
            handleChangeValues: vi.fn(),
            handleOpenMediaGallery: vi.fn(),
        },
    })
        .get('[data-test="editor"]')
        .text();
}
// #endregion

describe('properties panel: the type a row hands its editor', () => {
    it('gives a media picker the kind of its property', () => {
        expect(readEditorType('video', 'video')).toBe('video');
        expect(readEditorType('file', 'file')).toBe('file');
    });

    it('gives a text field its input type', () => {
        expect(readEditorType('input', 'number')).toBe('number');
        expect(readEditorType('input', 'string')).toBe('text');
    });
});
