/**
 * @vitest-environment happy-dom
 *
 * The gallery of a brick property draws a header of its own. The label of a brick
 * property is generated out of its key, so the header used to read "Project1Images"
 * while the description the author wrote hung above the gallery as a separate line. A
 * description takes the place of the label there, as in the caption of every other row.
 */

// #region Imports
// Vitest
import { describe, expect, it, vi } from 'vitest';

// Types
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
/** Gallery that shows the caption it was given */
const GalleryStub = markRaw(
    defineComponent({
        name: 'GalleryStub',
        props: { label: { type: String, default: '' } },
        setup: (props) => () => h('div', { 'data-test': 'gallery' }, props.label),
    })
);

const EDITOR_STUBS = PROPERTY_EDITOR_ORDER.reduce(
    (map, type) => ({ ...map, [type]: GalleryStub }),
    {} as Record<TPropertyEditorType, Component>
);
// #endregion

// #region Methods
/**
 * Mounts the row of a gallery property.
 *
 * @param description - The description the author gave the property, if any.
 * @returns The mounted row.
 */
function mountGalleryRow(description?: string) {
    const variant: IComponentVariant = {
        label: 'Project1Images',
        value: [],
        disabled: false,
        property: {
            name: 'project1Images',
            type: 'image-gallery',
            label: 'Project1Images',
            description,
        } as never,
    };

    return mount(BuilderShellSidebarPropertyEditorRow, {
        props: {
            type: 'image-gallery',
            variant,
            componentEditors: EDITOR_STUBS,
            handleChangeValues: vi.fn(),
            handleOpenMediaGallery: vi.fn(),
        },
    });
}
// #endregion

describe('properties panel: the caption of a gallery', () => {
    it('shows the description in the header of the gallery, once', () => {
        const wrapper = mountGalleryRow('Project renders');

        expect(wrapper.get('[data-test="gallery"]').text()).toBe('Project renders');
        expect(wrapper.text().split('Project renders')).toHaveLength(2);
        expect(wrapper.text()).not.toContain('Project1Images');
    });

    it('keeps the label without a description', () => {
        const wrapper = mountGalleryRow();

        expect(wrapper.get('[data-test="gallery"]').text()).toBe('Project1Images');
    });
});
