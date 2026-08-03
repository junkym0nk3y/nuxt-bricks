// Types
import type { IGridLayoutProps } from '../../src/runtime/modules/layouts-blocks/types/blockProps';

// Vue
import { createCommentVNode, createSSRApp, createTextVNode, Fragment, h, ref } from 'vue';
import { renderToString } from 'vue/server-renderer';

// Vitest
import { describe, expect, it } from 'vitest';

// Constants
import { CANVAS_DRAG_ACTIVE_KEY } from '../../src/runtime/modules/common/constants/injectionKeys';

// Utils
import { countSlotContent } from '../../src/runtime/modules/layouts-blocks/utils/slotContent';

// Components
import BlockGrid from '../../src/runtime/modules/layouts-blocks/components/BlockGrid.vue';

const GRID_LAYOUT_PROPS: IGridLayoutProps = {
    columns: 2,
    rows: 3,
    gap: 12,
};

/**
 * Рендерит канвасный грид с заданным содержимым default-слота.
 *
 * @param children - Узлы слота (как их отдаёт канвас).
 * @returns HTML разметки блока.
 */
async function renderGrid(children: unknown[]): Promise<string> {
    const app = createSSRApp({
        render: () =>
            h(BlockGrid, { layoutId: 'layout-1', layoutProps: GRID_LAYOUT_PROPS }, () => children),
    });
    app.provide(CANVAS_DRAG_ACTIVE_KEY, ref(false));

    return renderToString(app);
}

describe('размер грида на канвасе следует за пропсами', () => {
    it('служебные узлы слота не считаются содержимым', () => {
        expect(countSlotContent(undefined)).toBe(0);
        expect(countSlotContent([createCommentVNode('v-if')])).toBe(0);
        expect(countSlotContent([h(Fragment, null, [])])).toBe(0);
        expect(countSlotContent([createTextVNode('   ')])).toBe(0);
        expect(countSlotContent([h(Fragment, null, [h('div')])])).toBe(1);
    });

    it('грид со слотом из анкоров и пустых фрагментов считается пустым', async () => {
        const html = await renderGrid([createCommentVNode('v-if'), h(Fragment, null, [])]);

        expect(html).toContain('grid-template-rows:repeat(3, minmax(4rem, auto))');
    });

    it('незанятые строки сохраняют высоту, когда в гриде уже есть ребёнок', async () => {
        const html = await renderGrid([h('div', { 'data-layout-drop-item': 'true' })]);

        expect(html).toContain('grid-template-rows:repeat(1, auto) repeat(2, minmax(4rem, auto))');
    });
});
