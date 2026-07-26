// Types
import type {
    IFlexLayoutProps,
    IGridLayoutProps,
    ISectionLayoutProps,
} from '../../src/runtime/modules/layouts-blocks/types/blockProps';

// Vue
import { createSSRApp, h, ref, type Component } from 'vue';
import { renderToString } from 'vue/server-renderer';

// Vitest
import { describe, expect, it } from 'vitest';

// Constants
import { CANVAS_DRAG_ACTIVE_KEY } from '../../src/runtime/modules/common/constants/injectionKeys';

// Components
import BlockFlex from '../../src/runtime/modules/layouts-blocks/components/BlockFlex.vue';
import BlockGrid from '../../src/runtime/modules/layouts-blocks/components/BlockGrid.vue';
import BlockSection from '../../src/runtime/modules/layouts-blocks/components/BlockSection.vue';

const GRID_LAYOUT_PROPS: IGridLayoutProps = {
    columns: 2,
    rows: 2,
    gap: 12,
};

const FLEX_LAYOUT_PROPS: IFlexLayoutProps = {
    direction: 'column',
    justify: 'start',
    align: 'stretch',
    gap: 12,
    wrap: false,
};

const SECTION_LAYOUT_PROPS: ISectionLayoutProps = {
    paddingX: 2,
};

/** Пустые layout-блоки канваса и их дефолтные пропсы. */
const EMPTY_LAYOUT_BLOCKS: Array<{ name: string; block: Component; layoutProps: object }> = [
    { name: 'BlockGrid', block: BlockGrid, layoutProps: GRID_LAYOUT_PROPS },
    { name: 'BlockFlex', block: BlockFlex, layoutProps: FLEX_LAYOUT_PROPS },
    { name: 'BlockSection', block: BlockSection, layoutProps: SECTION_LAYOUT_PROPS },
];

/**
 * Рендерит пустой canvas layout-блок с явным глобальным состоянием drag-сессии.
 *
 * @param block - Компонент layout-блока.
 * @param layoutProps - Дефолтные пропсы блока.
 * @param isDragActive - Активна ли drag-сессия canvas.
 */
async function renderEmptyBlock(
    block: Component,
    layoutProps: object,
    isDragActive: boolean
): Promise<string> {
    const app = createSSRApp({
        render: () => h(block, { layoutId: 'layout-1', layoutProps }),
    });
    app.provide(CANVAS_DRAG_ACTIVE_KEY, ref(isDragActive));

    return renderToString(app);
}

describe('layout drag visuals', () => {
    it('использует стабильный injection key, переживающий HMR-переоценку модуля', () => {
        expect(Symbol.keyFor(CANVAS_DRAG_ACTIVE_KEY)).toBe('nuxt-bricks.canvasDragActive');
    });

    it.each(EMPTY_LAYOUT_BLOCKS)(
        '$name показывает пустой drop-маркер вне drag-сессии',
        async ({ block, layoutProps }) => {
            const html = await renderEmptyBlock(block, layoutProps, false);

            expect(html).toContain('data-layout-drop-placeholder="true"');
        }
    );

    it.each(EMPTY_LAYOUT_BLOCKS)(
        '$name не рендерит пустой drop-маркер во время drag-сессии',
        async ({ block, layoutProps }) => {
            const html = await renderEmptyBlock(block, layoutProps, true);

            expect(html).not.toContain('data-layout-drop-placeholder="true"');
        }
    );
});
