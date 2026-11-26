/**
 * @vitest-environment happy-dom
 *
 * The length ceiling of the text fields that take links. The kit field defaults to 120
 * characters, and a media library address alone runs past that: the native `maxlength`
 * cut a document link pasted into a gallery caption without a word, and the read-only
 * address of a file in the media library showed an error nobody could fix.
 */

// #region Imports
// Vitest
import { describe, expect, it, vi } from 'vitest';

// Types
import type { IBricksInputProps } from '../../src/runtime/modules/ui/inputs/types.d.ts';
import type { IGalleryItem } from '../../src/runtime/modules/common/types/content';
import {
    PROPERTY_EDITOR_ORDER,
    type IComponentVariant,
    type TPropertyEditorType,
} from '../../src/runtime/modules/builder/shell/sidebar/components/property-editors/types';

// Vue
import { defineComponent, h, markRaw, nextTick, reactive, type Component } from 'vue';
import { flushPromises, mount } from '@vue/test-utils';
// #endregion

// #region Mocks
vi.mock('vue-i18n', () => ({
    useI18n: () => ({ t: (key: string) => key, te: () => false }),
}));

/** Every value breaks a rule: whatever comes out clean was never validated */
vi.mock('vee-validate', () => ({
    validate: async () => ({ errors: ['too long'] }),
}));
// #endregion

import BuilderShellSidebarPropertyEditorRow from '../../src/runtime/modules/builder/shell/sidebar/components/BuilderShellSidebarPropertyEditorRow.vue';
import BuilderShellSidebarPropertyImageGalleryEditor from '../../src/runtime/modules/builder/shell/sidebar/components/property-editors/BuilderShellSidebarPropertyImageGalleryEditor.vue';
import { useBricksInput } from '../../src/runtime/modules/ui/inputs/composables/useBricksInput';

// #region Data
/** Text field that shows the ceiling it was given */
const InputStub = markRaw(
    defineComponent({
        name: 'BricksInput',
        props: { maxLength: { type: Number, default: undefined } },
        setup: (props) => () => h('input', { 'data-max': String(props.maxLength) }),
    })
);

const EDITOR_STUBS = PROPERTY_EDITOR_ORDER.reduce(
    (map, type) => ({ ...map, [type]: InputStub }),
    {} as Record<TPropertyEditorType, Component>
);

const GALLERY_ITEM: IGalleryItem = { id: 'deck', url: '/media/a.webp', title: 'Deck', caption: '' };
// #endregion

describe('length of the text fields that take links', () => {
    it('lets a text property of a block run to 300 characters', () => {
        const variant: IComponentVariant = {
            label: 'Button link',
            value: '',
            disabled: false,
            property: { name: 'buttonLink', type: 'string', label: 'Button link', default: '' },
        };
        const wrapper = mount(BuilderShellSidebarPropertyEditorRow, {
            props: {
                type: 'input',
                variant,
                componentEditors: EDITOR_STUBS,
                handleChangeValues: vi.fn(),
                handleOpenMediaGallery: vi.fn(),
            },
        });

        expect(wrapper.get('input').attributes('data-max')).toBe('300');
    });

    it('lets the title and the caption of a gallery item run to 300 characters', () => {
        const wrapper = mount(BuilderShellSidebarPropertyImageGalleryEditor, {
            props: { modelValue: [GALLERY_ITEM], fields: { title: true, caption: true } },
            global: {
                stubs: { BricksInput: InputStub, BricksIcon: true, BricksTagsEditor: true },
            },
        });
        const ceilings = wrapper.findAll('input').map((input) => input.attributes('data-max'));

        expect(ceilings).toEqual(['300', '300']);
    });

    it.each(['readonly', 'disabled'] as const)(
        'puts no length limit on a %s field',
        async (lock) => {
            const props = reactive<IBricksInputProps>({
                value: '',
                type: 'text',
                [lock]: true,
                maxLength: 120,
                errorMessage: null,
            });
            const api = useBricksInput(props, vi.fn());

            props.value = `https://storage.example/media/${'a'.repeat(120)}.pdf`;
            await nextTick();
            await flushPromises();
            expect(api.errorMessage.value).toBeNull();
            expect(api.inputAttributes.value.maxlength).toBeUndefined();

            // The same field unlocked is limited: the checks above are not vacuous
            props[lock] = false;
            props.value = `${props.value}?v=2`;
            await nextTick();
            await flushPromises();
            expect(api.errorMessage.value).toBe('too long');
            expect(api.inputAttributes.value.maxlength).toBe(120);
        }
    );
});
