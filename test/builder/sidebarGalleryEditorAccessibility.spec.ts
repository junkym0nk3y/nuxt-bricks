/**
 * @vitest-environment happy-dom
 *
 * The gallery property editor of the sidebar: the ways in that used to exist for
 * the pointer alone.
 *
 * The thumbnail that replaces an image and the empty state were clickable `div`s:
 * Tab walked past them and Enter did nothing, so with the keyboard the gallery
 * could neither be filled nor changed. The three per-item actions were glyphs
 * inside a button with no accessible name at all, that is a screen reader
 * announced three nameless buttons per card.
 *
 * The ordinal in the name is part of the fix rather than decoration: a list of a
 * dozen images gives a dozen identical "Move up" buttons otherwise, and there is
 * nothing to tell them apart by ear.
 */

// #region Imports
// Vitest
import { describe, expect, it, vi } from 'vitest';

// Types
import type { IGalleryItem } from '../../src/runtime/modules/common/types/content';

// Vue
import { defineComponent, h } from 'vue';
import { mount } from '@vue/test-utils';
// #endregion

// #region Mocks
vi.mock('vue-i18n', () => ({
    useI18n: () => ({
        t: (key: string, params?: Record<string, unknown>) => {
            if (!params) {
                return key;
            }

            const value = params.number ?? params.tag ?? params.filename;

            return `${key}:${String(value)}`;
        },
    }),
}));
// #endregion

import BuilderShellSidebarPropertyImageGalleryEditor from '../../src/runtime/modules/builder/shell/sidebar/components/property-editors/BuilderShellSidebarPropertyImageGalleryEditor.vue';

// #region Data
/** The builder registers its icon globally through an app plugin — here a stub. */
const BricksIconStub = defineComponent({
    name: 'BricksIcon',
    props: { icon: { type: String, default: '' } },
    setup: (props) => () => h('i', { 'data-icon': props.icon }),
});

/**
 * Stand-in for the text field of a card. The real one validates through
 * vee-validate, whose rules are registered by an app plugin that does not exist
 * here — an unregistered rule rejects out of the input and reaches nobody.
 */
const BricksInputStub = defineComponent({
    name: 'BricksInput',
    props: { value: { type: String, default: '' } },
    emits: ['update:value'],
    setup:
        (props, { emit, attrs }) =>
        () =>
            h('input', {
                ...attrs,
                value: props.value,
                onInput: (event: Event) =>
                    emit('update:value', (event.target as HTMLInputElement).value),
            }),
});

/** Stand-in for the tags editor: the write, without the tag input of its own */
const BricksTagsEditorStub = defineComponent({
    name: 'BricksTagsEditor',
    props: { modelValue: { type: Array, default: () => [] } },
    emits: ['update:modelValue'],
    setup:
        (props, { emit, attrs }) =>
        () =>
            h('button', {
                ...attrs,
                onClick: () => emit('update:modelValue', [...props.modelValue, 'added']),
            }),
});

const GALLERY_ITEMS: IGalleryItem[] = [
    { id: 'first', url: '/media/first.png', title: 'First' },
    { id: 'second', url: '/media/second.png', title: 'Second' },
    { id: 'third', url: '/media/third.png', title: 'Third' },
];
// #endregion

// #region Methods
/**
 * Mounts the editor with the given gallery value.
 *
 * @param modelValue - The gallery items shown by the editor.
 * @returns The mounted wrapper.
 */
function mountEditor(modelValue: IGalleryItem[]) {
    return mount(BuilderShellSidebarPropertyImageGalleryEditor, {
        props: { modelValue },
        global: { components: { BricksIcon: BricksIconStub } },
    });
}
// #endregion

describe('sidebar gallery editor: the keyboard ways in', () => {
    it('replaces an image through a real button that names the image it belongs to', async () => {
        const wrapper = mountEditor(GALLERY_ITEMS);

        const replaceButtons = wrapper
            .findAll('button')
            .filter((button) =>
                button
                    .attributes('aria-label')
                    ?.startsWith('bricks.properties.gallery.replaceImage')
            );

        expect(replaceButtons).toHaveLength(3);
        expect(replaceButtons.map((button) => button.attributes('aria-label'))).toEqual([
            'bricks.properties.gallery.replaceImage:1',
            'bricks.properties.gallery.replaceImage:2',
            'bricks.properties.gallery.replaceImage:3',
        ]);
        expect(replaceButtons.every((button) => button.attributes('type') === 'button')).toBe(true);

        await replaceButtons[1].trigger('click');

        expect(wrapper.emitted('openGallery')).toEqual([[{ action: 'replace', itemIndex: 1 }]]);
    });

    it('names the three per-item actions apart and blocks the moves at the ends', () => {
        const wrapper = mountEditor(GALLERY_ITEMS);

        const names = wrapper
            .findAll('button')
            .map((button) => button.attributes('aria-label'))
            .filter((name): name is string => Boolean(name));

        expect(names).toContain('bricks.properties.gallery.moveUp:2');
        expect(names).toContain('bricks.properties.gallery.moveDown:2');
        expect(names).toContain('bricks.properties.gallery.remove:2');
        expect(new Set(names).size).toBe(names.length);

        const moveUpFirst = wrapper.get('[aria-label="bricks.properties.gallery.moveUp:1"]');
        const moveDownLast = wrapper.get('[aria-label="bricks.properties.gallery.moveDown:3"]');
        const moveUpSecond = wrapper.get('[aria-label="bricks.properties.gallery.moveUp:2"]');

        expect(moveUpFirst.attributes('aria-disabled')).toBe('true');
        expect(moveDownLast.attributes('aria-disabled')).toBe('true');
        expect(moveUpSecond.attributes('aria-disabled')).toBeUndefined();
    });

    it('keeps a blocked move focusable, so the keyboard survives a reorder', async () => {
        const wrapper = mountEditor(GALLERY_ITEMS);
        const moveUpSecond = wrapper.get('[aria-label="bricks.properties.gallery.moveUp:2"]');

        await moveUpSecond.trigger('click');
        const [[reordered]] = wrapper.emitted('update:modelValue') as [IGalleryItem[]][];
        await wrapper.setProps({ modelValue: reordered });

        // The card the person moved now stands first, that is its own "up" is the
        // blocked one. A native `disabled` here would drop the focus the browser
        // was holding, and the keyboard would leave the panel after every move
        const movedUp = wrapper.get('[aria-label="bricks.properties.gallery.moveUp:1"]');

        expect(movedUp.attributes('disabled')).toBeUndefined();
        expect(movedUp.attributes('aria-disabled')).toBe('true');

        await movedUp.trigger('click');

        expect(wrapper.emitted('update:modelValue')).toHaveLength(1);
    });

    it('names the text fields of a card by the same ordinal', () => {
        const wrapper = mountEditor(GALLERY_ITEMS);
        const titleNames = wrapper
            .findAll('input')
            .map((input) => input.attributes('aria-label'))
            .filter((name): name is string => Boolean(name));

        expect(titleNames).toEqual([
            'bricks.properties.gallery.titleLabel:1',
            'bricks.properties.gallery.titleLabel:2',
            'bricks.properties.gallery.titleLabel:3',
        ]);
    });

    it('names the tags editor of a card, which loses its placeholder on the first tag', () => {
        const wrapper = mount(BuilderShellSidebarPropertyImageGalleryEditor, {
            props: {
                modelValue: [{ id: 'first', url: '/media/first.png', tags: ['summer'] }],
                fields: { tags: true },
            },
            global: { components: { BricksIcon: BricksIconStub } },
        });

        const tagsInput = wrapper
            .findAll('input')
            .find(
                (input) =>
                    input.attributes('aria-label') === 'bricks.properties.gallery.tagsLabel:1'
            );

        expect(tagsInput).toBeDefined();
        expect(wrapper.find('[aria-label="bricks.common.removeTag:summer"]').exists()).toBe(true);
    });

    it('writes each field of a card into the field it belongs to', async () => {
        // The three fields share one generic write that takes the name of the field
        // as an argument. A swapped pair of names still type-checks — both are keys
        // of the same item — so the mapping shows only in the value that comes out
        const wrapper = mount(BuilderShellSidebarPropertyImageGalleryEditor, {
            props: {
                modelValue: [{ id: 'first', url: '/media/first.png', title: 'First' }],
                fields: { caption: true, tags: true },
            },
            global: {
                components: { BricksIcon: BricksIconStub },
                stubs: { BricksInput: BricksInputStub, BricksTagsEditor: BricksTagsEditorStub },
            },
        });

        await wrapper
            .get('[aria-label="bricks.properties.gallery.titleLabel:1"]')
            .setValue('Named');
        await wrapper
            .get('[aria-label="bricks.properties.gallery.captionLabel:1"]')
            .setValue('Described');
        await wrapper.get('[aria-label="bricks.properties.gallery.tagsLabel:1"]').trigger('click');

        const updates = wrapper.emitted('update:modelValue') as IGalleryItem[][][];

        expect(updates[0][0][0]).toEqual({ id: 'first', url: '/media/first.png', title: 'Named' });
        expect(updates[1][0][0]).toEqual({
            id: 'first',
            url: '/media/first.png',
            title: 'First',
            caption: 'Described',
        });
        expect(updates[2][0][0]).toEqual({
            id: 'first',
            url: '/media/first.png',
            title: 'First',
            tags: ['added'],
        });
    });

    it('reorders and removes an item from its own action', async () => {
        const wrapper = mountEditor(GALLERY_ITEMS);

        await wrapper.get('[aria-label="bricks.properties.gallery.moveUp:2"]').trigger('click');
        await wrapper.get('[aria-label="bricks.properties.gallery.remove:3"]').trigger('click');

        const updates = wrapper.emitted('update:modelValue') as IGalleryItem[][][];

        expect(updates[0][0].map((item) => item.id)).toEqual(['second', 'first', 'third']);
        expect(updates[1][0].map((item) => item.id)).toEqual(['first', 'second']);
    });

    it('offers the empty gallery a button rather than a clickable container', async () => {
        const wrapper = mountEditor([]);

        const emptyState = wrapper
            .findAll('button')
            .find((button) => button.text().includes('bricks.properties.gallery.empty'));

        expect(emptyState).toBeDefined();
        expect(emptyState?.attributes('type')).toBe('button');

        await emptyState?.trigger('click');

        expect(wrapper.emitted('openGallery')).toEqual([[{ action: 'append', insertIndex: 0 }]]);
    });
});
