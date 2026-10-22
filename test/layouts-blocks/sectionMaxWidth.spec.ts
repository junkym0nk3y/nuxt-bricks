/**
 * The maximum content width of Section on both surfaces.
 *
 * The published render picks a grid of one centered column for every device once any
 * device limits the content width, and a section without a limit keeps the flex column it
 * always had. The canvas resolves the props of the drawn device alone, so it follows the
 * flag of its binding rather than the value of that device: on a device lifting the limit
 * it would otherwise lay the children out by another model than the page.
 */

// #region Imports
// Types
import type {
    IBricksComponent,
    TBricksDeviceKey,
} from '../../src/runtime/modules/common/types/brick';
import type { ISectionLayoutProps } from '../../src/runtime/modules/layouts-blocks/types/blockProps';
import type {
    IBlockCanvasContext,
    IBlockDefinition,
    IBlockRenderContext,
} from '../../src/runtime/modules/layouts-blocks/types/registry';

// Vue
import { createSSRApp, h } from 'vue';
import { renderToString } from 'vue/server-renderer';

// Vitest
import { describe, expect, it } from 'vitest';

// Registry
import {
    BLOCK_REGISTRY,
    resolveBlockProps,
    resolveCanvasBind,
} from '../../src/runtime/modules/layouts-blocks/registry';

// Components
import BlockSection from '../../src/runtime/modules/layouts-blocks/components/BlockSection.vue';
// #endregion

// #region Data
const SECTION = BLOCK_REGISTRY.Section as IBlockDefinition;

const LIMITED_LAYOUT = {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, var(--bricks-section-max-w))',
    justifyContent: 'center',
    alignContent: 'start',
};

const PLAIN_PADDING = 'var(--bricks-section-pt) var(--bricks-section-px) var(--bricks-section-pb)';
// #endregion

// #region Methods
/**
 * The inline style of the root of the published Section.
 *
 * @param props - Props of the schema component.
 * @returns Style object of the root node.
 */
function publishedStyle(props: Record<string, unknown>): Record<string, string> {
    const vnode = SECTION.renderPublished!({
        component: { id: 'block-1', componentName: 'Section', props },
        definition: SECTION,
        extraClasses: [],
        extraAttrs: {},
        styles: {},
        renderChild: () => null,
        getChildComponents: () => [],
    } as unknown as IBlockRenderContext);

    return (vnode.props?.style ?? {}) as Record<string, string>;
}

/**
 * The props the canvas Section receives for a device, assembled through the dispatcher
 * the way the builder does it.
 *
 * @param props - Props of the schema component.
 * @param device - The sheet being drawn.
 * @returns Props of the canvas component.
 */
function canvasProps(props: Record<string, unknown>, device: TBricksDeviceKey) {
    return resolveCanvasBind(SECTION, {
        component: { id: 'block-1', componentName: 'Section', props } as IBricksComponent,
        layoutProps: resolveBlockProps('Section', props, device),
        boundProps: { ...props },
        childComponents: [],
        renderChild: () => null,
        t: (key: string) => key,
    } as unknown as IBlockCanvasContext);
}

/**
 * The inline style of the root of the canvas Section.
 *
 * @param layoutProps - Props of the drawn device.
 * @param hasContentLimit - Whether some device limits the content width.
 * @returns The value of the `style` attribute.
 */
async function canvasStyle(
    layoutProps: ISectionLayoutProps,
    hasContentLimit?: boolean
): Promise<string> {
    const app = createSSRApp({
        render: () => h(BlockSection, { layoutId: 'layout-1', layoutProps, hasContentLimit }),
    });
    const html = await renderToString(app);

    return /style="([^"]*)"/.exec(html)?.[1] ?? '';
}
// #endregion

describe('published Section: the maximum content width', () => {
    it('a section without a limit renders exactly as before the property existed', () => {
        const style = publishedStyle({ paddingX: 2 });

        expect(style.display).toBe('flex');
        expect(style.flexDirection).toBe('column');
        expect(style.gridTemplateColumns).toBeUndefined();
        expect(style.padding).toBe(PLAIN_PADDING);
        expect(Object.keys(style).filter((key) => key.includes('max-w'))).toEqual([]);
    });

    it('limits the content area while the section itself stays full width', () => {
        const style = publishedStyle({ maxWidth: 172, paddingX: 2, backgroundColor: '#f1f3f6' });

        expect(style).toMatchObject(LIMITED_LAYOUT);
        // The horizontal padding is the minimum margin, not a share of the width: a
        // percentage there resolved against the Flex row holding the section
        expect(style.padding).toBe(PLAIN_PADDING);
        expect(style.flexDirection).toBeUndefined();
        expect(style['--bricks-section-max-w-base']).toBe('172rem');
        expect(style['--bricks-section-px-base']).toBe('2rem');
        expect(style.width).toBe('100%');
        expect(style.backgroundColor).toBe('var(--bricks-section-bg-color)');
    });

    it('a zero on a device lifts the limit of the base one', () => {
        const style = publishedStyle({ maxWidth: 172, responsive: { mobile: { maxWidth: 0 } } });

        expect(style['--bricks-section-max-w-base']).toBe('172rem');
        expect(style['--bricks-section-max-w-mobile']).toBe('100%');
    });

    it('a limit living on one device alone still reaches the page', () => {
        const style = publishedStyle({ responsive: { tablet: { maxWidth: 120 } } });

        expect(style).toMatchObject(LIMITED_LAYOUT);
        expect(style['--bricks-section-max-w-base']).toBe('100%');
        expect(style['--bricks-section-max-w-tablet']).toBe('120rem');
    });
});

describe('canvas Section: the maximum content width', () => {
    it('resolves the same limit as the page for the same device', () => {
        const props = { maxWidth: 172, responsive: { mobile: { maxWidth: 0 } } };

        expect(canvasProps(props, 'desktop').layoutProps).toMatchObject({ maxWidth: 172 });
        expect(canvasProps(props, 'mobile').layoutProps).toMatchObject({ maxWidth: 0 });
    });

    it('is told the layout model of the page on every device', () => {
        // Mobile lifts the limit, yet the published section is a grid there too
        const limited = { maxWidth: 0, responsive: { tablet: { maxWidth: 120 } } };

        for (const device of ['desktop', 'tablet', 'mobile'] as TBricksDeviceKey[]) {
            expect(canvasProps(limited, device), device).toMatchObject({
                hasContentLimit: true,
                layoutId: 'block-1',
                'data-bricks-layout': 'section',
            });
        }

        expect(canvasProps({ maxWidth: 0 }, 'desktop').hasContentLimit).toBe(false);
    });

    it('stays a flex column with the declared padding when no device has a limit', async () => {
        const style = await canvasStyle({ paddingX: 2, maxWidth: 0 });

        expect(style).toContain('display:flex;');
        expect(style).toContain('flex-direction:column;');
        expect(style).not.toContain('grid-template-columns');
        expect(style).toContain('padding:0rem 2rem 0rem;');
    });

    it('centers a column no wider than the limit of the drawn device', async () => {
        const style = await canvasStyle({ paddingX: 2, maxWidth: 120 }, true);

        expect(style).toContain('display:grid;');
        expect(style).toContain('grid-template-columns:minmax(0, 120rem);');
        expect(style).toContain('justify-content:center;');
        expect(style).toContain('align-content:start;');
        expect(style).toContain('padding:0rem 2rem 0rem;');
    });

    it('keeps the background, the radius and the height on the section itself', async () => {
        // The limit narrows the column alone: whatever paints the section stays on its
        // root, as wide as the section
        const style = await canvasStyle(
            {
                maxWidth: 60,
                backgroundColor: '#f1f3f6',
                backgroundImage: 'https://cdn.example/bg.webp',
                borderRadius: 1.6,
                minHeight: 40,
            },
            true
        );

        expect(style).toContain('grid-template-columns:minmax(0, 60rem);');
        expect(style).toContain('width:100%;');
        expect(style).toContain('background-color:#f1f3f6;');
        expect(style).toContain('background-image:url(https://cdn.example/bg.webp);');
        expect(style).toContain('border-radius:1.6rem;');
        expect(style).toContain('min-height:40rem;');
    });

    it('keeps the grid of the page on a device that lifts the limit', async () => {
        const style = await canvasStyle({ paddingX: 2, maxWidth: 0 }, true);

        expect(style).toContain('display:grid;');
        expect(style).toContain('grid-template-columns:minmax(0, 100%);');
    });
});
