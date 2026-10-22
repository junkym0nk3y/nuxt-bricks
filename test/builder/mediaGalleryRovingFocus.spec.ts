/**
 * @vitest-environment happy-dom
 *
 * The single tab stop of the media library grid.
 *
 * Before this every tile carried `tabindex="0"`: a library of a hundred files was
 * a hundred stops on the way past the grid, and the full-screen button inside each
 * tile added one more apiece.
 *
 * Checked here is the state and the markup — which cell holds the tab stop, and
 * what happens to it when a filter takes that cell out of the grid. The movement
 * of the real focus by the arrows is not: neither happy-dom nor jsdom reproduces
 * the way the primitive walks the collection, so the keys belong to the browser
 * test.
 */

// #region Imports
// Vitest
import { describe, expect, it, vi } from 'vitest';

// Types
import type { IMediaItem } from '../../src/runtime/modules/common/types/media';

// Vue
import { defineComponent, h, nextTick, ref } from 'vue';
import { mount } from '@vue/test-utils';
// #endregion

// #region Mocks
const { permissionsMock } = vi.hoisted(() => ({
    permissionsMock: { canEdit: true },
}));

vi.mock('vue-i18n', () => ({
    useI18n: () => ({
        t: (key: string, params?: Record<string, unknown>) =>
            params ? `${key}:${String(params.filename ?? params.number)}` : key,
    }),
}));

vi.mock('../../src/runtime/modules/builder/core/composables/useBuilderPermissions', () => ({
    useBuilderPermissions: () => permissionsMock,
}));
// #endregion

import BuilderMediaGalleryGrid from '../../src/runtime/modules/builder/media/components/BuilderMediaGalleryGrid.vue';
import { useMediaGalleryRovingFocus } from '../../src/runtime/modules/builder/media/composables/useMediaGalleryRovingFocus';

// #region Data
/** The builder registers its icon globally through an app plugin — here a stub. */
const BricksIconStub = defineComponent({
    name: 'BricksIcon',
    props: { icon: { type: String, default: '' } },
    setup: (props) => () => h('i', { 'data-icon': props.icon }),
});

/**
 * Builds a media item; only the fields the grid reads are filled.
 *
 * @param id - The item id.
 * @param filename - The file name shown under the preview.
 * @returns The media item.
 */
function mediaItem(id: number, filename: string): IMediaItem {
    return {
        id,
        filename,
        url: `/media/${filename}`,
        size: 1024,
        mimeType: 'image/png',
    } as unknown as IMediaItem;
}

const ITEMS = [mediaItem(1, 'one.png'), mediaItem(2, 'two.png'), mediaItem(3, 'three.png')];
// #endregion

// #region Methods
/**
 * Mounts the grid with the given items and selection.
 *
 * @param items - The items of the grid.
 * @param selectedItemId - The selected file, or null.
 * @returns The mounted wrapper.
 */
function mountGrid(items: IMediaItem[], selectedItemId: number | null = null) {
    return mount(BuilderMediaGalleryGrid, {
        props: { items, selectedItemId, showSkeleton: false, showUploadTile: true },
        global: {
            components: { BricksIcon: BricksIconStub },
            stubs: { Transition: false },
        },
    });
}
// #endregion

describe('media gallery grid: one tab stop instead of one per tile', () => {
    it('leaves exactly one cell in the tab order', () => {
        const wrapper = mountGrid(ITEMS);
        const options = wrapper.findAll('[role="gridcell"]');

        expect(wrapper.findAll('[role="row"]')).toHaveLength(1);
        expect(options).toHaveLength(3);
        expect(options.filter((option) => option.attributes('tabindex') === '0')).toHaveLength(1);
        expect(options[0].attributes('tabindex')).toBe('0');
    });

    it('opens standing on the selected file', () => {
        const wrapper = mountGrid(ITEMS, 3);
        const options = wrapper.findAll('[role="gridcell"]');

        expect(options[2].attributes('tabindex')).toBe('0');
        expect(options[0].attributes('tabindex')).toBe('-1');
    });

    it('keeps the full-screen button of the inactive tiles out of the tab order', () => {
        const wrapper = mountGrid(ITEMS, 2);
        const previewButtons = wrapper
            .findAll('button')
            .filter((button) =>
                button.attributes('aria-label')?.startsWith('bricks.media.fullscreenFor')
            );

        expect(previewButtons).toHaveLength(3);
        expect(previewButtons.map((button) => button.attributes('tabindex'))).toEqual([
            '-1',
            '0',
            '-1',
        ]);
    });

    it('names every full-screen button by its own file', () => {
        const wrapper = mountGrid(ITEMS);
        const names = wrapper
            .findAll('button')
            .map((button) => button.attributes('aria-label'))
            .filter((name): name is string =>
                Boolean(name?.startsWith('bricks.media.fullscreenFor'))
            );

        expect(names).toEqual([
            'bricks.media.fullscreenFor:one.png',
            'bricks.media.fullscreenFor:two.png',
            'bricks.media.fullscreenFor:three.png',
        ]);
    });

    it('keeps the upload tile out of the table of cells', () => {
        const wrapper = mountGrid(ITEMS);
        const grid = wrapper.get('[role="grid"]');
        const uploadTile = wrapper
            .findAll('button')
            .find((button) => button.text().includes('bricks.media.tileUpload'));

        expect(uploadTile).toBeDefined();
        expect(grid.element.contains(uploadTile!.element)).toBe(false);
        expect(grid.findAll('[role="gridcell"]')).toHaveLength(3);
    });
});

describe('media gallery roving focus: where the tab stop goes', () => {
    /**
     * Drives the composable outside a component: the grid receives its list in
     * props, and the getters stand in for them.
     *
     * @param initialItems - The starting list.
     * @param initialSelected - The starting selection.
     * @returns The composable result together with the setters of its inputs.
     */
    function harness(initialItems: IMediaItem[], initialSelected: number | null = null) {
        const items = ref<IMediaItem[]>(initialItems);
        const selected = ref<number | null>(initialSelected);
        let result!: ReturnType<typeof useMediaGalleryRovingFocus>;

        mount(
            defineComponent({
                setup() {
                    result = useMediaGalleryRovingFocus({
                        items: () => items.value,
                        selectedItemId: () => selected.value,
                    });

                    return () => h('div', String(result.activeItemId.value));
                },
            })
        );

        return {
            result,
            /**
             * Replaces the list and lets the watchers run.
             *
             * @param next - The new list.
             */
            async setItems(next: IMediaItem[]): Promise<void> {
                items.value = next;
                await nextTick();
            },
            /**
             * Replaces the selection and lets the watchers run.
             *
             * @param next - The new selected id.
             */
            async setSelected(next: number | null): Promise<void> {
                selected.value = next;
                await nextTick();
            },
        };
    }

    it('falls back to the neighbor by the former place when a filter drops the active cell', async () => {
        const { result, setItems } = harness(ITEMS);

        result.activeItemId.value = '3';
        await setItems([ITEMS[0], ITEMS[1]]);

        expect(result.activeItemId.value).toBe('2');
    });

    it('prefers the selected file over the former place', async () => {
        const { result, setItems } = harness(ITEMS, 1);

        result.activeItemId.value = '3';
        await setItems([ITEMS[0], ITEMS[1]]);

        expect(result.activeItemId.value).toBe('1');
    });

    it('holds the active cell while it survives the filter', async () => {
        const { result, setItems } = harness(ITEMS);

        result.activeItemId.value = '2';
        await setItems([ITEMS[1], ITEMS[2]]);

        expect(result.activeItemId.value).toBe('2');
    });

    it('takes the tab stop along when the selection changes from the outside', async () => {
        const { result, setSelected } = harness(ITEMS);

        expect(result.activeItemId.value).toBe('1');

        await setSelected(3);

        expect(result.activeItemId.value).toBe('3');
    });

    it('has no tab stop on an empty grid', async () => {
        const { result, setItems } = harness(ITEMS);

        await setItems([]);

        expect(result.activeItemId.value).toBeNull();
        expect(result.isActiveItem(1)).toBe(false);
    });
});
