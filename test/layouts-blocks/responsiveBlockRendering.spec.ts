/**
 * The properties a block adapts per device, on both surfaces.
 *
 * The defect this guards against is quiet by nature: the properties panel writes an
 * override into `props.responsive[device]`, the canvas resolves it and shows it
 * applied, and the published page — which picks its values through CSS variables —
 * keeps the base one, because no variable was ever emitted for that property. Every
 * case below therefore looks at BOTH sides of one property: the variables of the
 * published render and the props the canvas resolves for a device.
 */

// #region Imports
// Types
import type {
    IBricksComponent,
    TBricksDeviceKey,
} from '../../src/runtime/modules/common/types/brick';
import type {
    IBlockCanvasContext,
    IBlockDefinition,
    IBlockRenderContext,
} from '../../src/runtime/modules/layouts-blocks/types/registry';

// Vue
import type { VNode } from 'vue';

// Vitest
import { describe, expect, it } from 'vitest';

// Registry
import {
    BLOCK_REGISTRY,
    resolveBlockProps,
    resolveCanvasBind,
} from '../../src/runtime/modules/layouts-blocks/registry';
// #endregion

// #region Methods
/**
 * The root vnode of a published render.
 *
 * @param blockName - Name of the block in the registry.
 * @param props - Props of the schema component.
 * @returns The vnode the render produced.
 */
function publishedVNode(blockName: string, props: Record<string, unknown>): VNode {
    const definition = BLOCK_REGISTRY[blockName] as IBlockDefinition;
    const component = {
        id: 'block-1',
        componentName: definition.name,
        props,
    } as unknown as IBricksComponent;

    return definition.renderPublished!({
        component,
        definition,
        extraClasses: [],
        extraAttrs: {},
        styles: {},
        renderChild: () => null,
        getChildComponents: () => [],
    } as unknown as IBlockRenderContext);
}

/**
 * The props a canvas component receives for a viewport, assembled the way the builder
 * does it: through the dispatcher, so the overlay of the adaptive properties is part of
 * what is being checked.
 *
 * @param blockName - Name of the block in the registry.
 * @param props - Props of the schema component.
 * @param viewport - The sheet being drawn.
 * @returns Props of the canvas component.
 */
function canvasProps(
    blockName: string,
    props: Record<string, unknown>,
    viewport: string
): Record<string, unknown> {
    const definition = BLOCK_REGISTRY[blockName] as IBlockDefinition;

    return resolveCanvasBind(definition, {
        component: { id: 'block-1', componentName: definition.name, props },
        layoutProps: resolveBlockProps(blockName, props, viewport as TBricksDeviceKey),
        boundProps: { ...props },
        childComponents: [],
        renderChild: () => null,
        t: (key: string) => key,
    } as unknown as IBlockCanvasContext);
}

/**
 * The inline style of the root node of a published render.
 *
 * @param blockName - Name of the block in the registry.
 * @param props - Props of the schema component.
 * @returns Style object of the root node.
 */
function publishedStyle(blockName: string, props: Record<string, unknown>): Record<string, string> {
    return (publishedVNode(blockName, props).props?.style ?? {}) as Record<string, string>;
}
// #endregion

describe('Section: the background adapts on both surfaces', () => {
    const props = {
        backgroundColor: '#000000',
        backgroundImage: 'https://cdn.example/desktop.webp',
        responsive: {
            mobile: {
                backgroundColor: '#ffffff',
                backgroundImage: 'https://cdn.example/mobile.webp',
            },
        },
    };

    it('the published render emits a variable per device', () => {
        const style = publishedStyle('Section', props);

        expect(style.backgroundColor).toBe('var(--bricks-section-bg-color)');
        expect(style['--bricks-section-bg-color-base']).toBe('#000000');
        expect(style['--bricks-section-bg-color-mobile']).toBe('#ffffff');
        expect(style.backgroundImage).toBe('var(--bricks-section-bg-image)');
        expect(style['--bricks-section-bg-image-base']).toBe(
            'url(https://cdn.example/desktop.webp)'
        );
        expect(style['--bricks-section-bg-image-mobile']).toBe(
            'url(https://cdn.example/mobile.webp)'
        );
    });

    it('the canvas resolves the same values for the same device', () => {
        expect(resolveBlockProps('Section', props, 'mobile').backgroundColor).toBe('#ffffff');
        expect(resolveBlockProps('Section', props, 'desktop').backgroundColor).toBe('#000000');
    });

    it('an empty override clears the background instead of falling back into the base', () => {
        // The person cleared the background on Mobile. Without a value of its own the
        // device variable would be absent, the fallback would hand it the base color
        // back, and the clearing would look like it did nothing
        const style = publishedStyle('Section', {
            backgroundColor: '#000000',
            backgroundImage: 'https://cdn.example/desktop.webp',
            responsive: { mobile: { backgroundColor: '', backgroundImage: '' } },
        });

        expect(style['--bricks-section-bg-color-mobile']).toBe('transparent');
        expect(style['--bricks-section-bg-image-mobile']).toBe('none');
    });

    it('a section with no background of its own declares none', () => {
        // An inline `background-color: transparent` would beat the stylesheet of a
        // consumer painting the section from the outside — the absence of a
        // declaration is what leaves that styling alone
        const style = publishedStyle('Section', { paddingTop: 4 });

        expect(style.backgroundColor).toBeUndefined();
        expect(style.backgroundImage).toBeUndefined();
        expect(style['--bricks-section-bg-color-base']).toBeUndefined();
    });

    it('a background living on one device alone still reaches the page', () => {
        // The base has none, Mobile has one: the declaration has to appear all the
        // same, otherwise the override would have nowhere to land
        const style = publishedStyle('Section', {
            responsive: { mobile: { backgroundColor: '#ffffff' } },
        });

        expect(style.backgroundColor).toBe('var(--bricks-section-bg-color)');
        expect(style['--bricks-section-bg-color-base']).toBe('transparent');
        expect(style['--bricks-section-bg-color-mobile']).toBe('#ffffff');
    });
});

describe('Grid and Flex: the paddings adapt on both surfaces', () => {
    const gridProps = {
        columns: 3,
        paddingX: 2,
        paddingY: 1,
        responsive: { mobile: { paddingX: 0.4 } },
    };

    it('Grid emits a padding variable per device', () => {
        const style = publishedStyle('Grid', gridProps);

        expect(style.padding).toContain('var(--bricks-grid-py');
        expect(style['--bricks-grid-px-base']).toBe('2rem');
        expect(style['--bricks-grid-px-mobile']).toBe('0.4rem');
        expect(style['--bricks-grid-py-base']).toBe('1rem');
    });

    it('a padding override does not drag the whole grid group along with it', () => {
        // The group of the grid is recomputed WHOLE for a device that overrides any of
        // its members. Folding the paddings into it would make one padding override
        // emit copies of the columns, the rows and the lead columns as well
        const style = publishedStyle('Grid', gridProps);

        expect(style['--bricks-grid-columns-mobile']).toBeUndefined();
        expect(style['--bricks-grid-gap-mobile']).toBeUndefined();
    });

    it('a Grid with no padding anywhere declares none', () => {
        const style = publishedStyle('Grid', { columns: 3 });

        expect(style.padding).toBeUndefined();
        expect(style['--bricks-grid-px-base']).toBeUndefined();
    });

    it('Flex adapts the alignment and the paddings', () => {
        const style = publishedStyle('Flex', {
            align: 'center',
            paddingY: 2,
            responsive: { mobile: { align: 'end', paddingY: 0.8 } },
        });

        // The alignment travels into the variable already mapped onto the CSS value:
        // the property of the block speaks of `start`/`end`, the box model of
        // `flex-start`/`flex-end`
        expect(style.alignItems).toBe(
            'var(--bricks-flex-align, var(--bricks-flex-align-base, stretch))'
        );
        expect(style['--bricks-flex-align-base']).toBe('center');
        expect(style['--bricks-flex-align-mobile']).toBe('flex-end');
        expect(style['--bricks-flex-py-base']).toBe('2rem');
        expect(style['--bricks-flex-py-mobile']).toBe('0.8rem');
    });

    it('the canvas resolves the same padding for the same device', () => {
        expect(resolveBlockProps('Grid', gridProps, 'mobile').paddingX).toBe(0.4);
        expect(resolveBlockProps('Grid', gridProps, 'desktop').paddingX).toBe(2);
    });
});

describe('Text: the margins adapt on both surfaces', () => {
    it('the published render emits a margin variable per device', () => {
        const style = publishedStyle('Text', {
            content: '<p>x</p>',
            marginTop: 2,
            responsive: { mobile: { marginTop: 0.8 } },
        });

        expect(style['--bricks-text-mt-base']).toBe('2rem');
        expect(style['--bricks-text-mt-mobile']).toBe('0.8rem');
    });

    it('a block with no margins carries no margin table at all', () => {
        // Zero is what the component falls back to on its own: a table emitted for
        // every text block of every page would be bytes paid for a value nobody set
        const style = publishedStyle('Text', { content: '<p>x</p>' });

        expect(style['--bricks-text-mt-base']).toBeUndefined();
        expect(style['--bricks-text-mb-base']).toBeUndefined();
    });
});

describe('Media and Svg: the fit, the alignment and the margins adapt', () => {
    it('Media emits a fit variable per device', () => {
        const style = publishedStyle('Media', {
            src: '/x.png',
            objectFit: 'cover',
            responsive: { mobile: { objectFit: 'contain' } },
        });

        expect(style['--bricks-media-fit-base']).toBe('cover');
        expect(style['--bricks-media-fit-mobile']).toBe('contain');
    });

    it('Svg maps the alignment into the variable before it reaches CSS', () => {
        // The property speaks of left/right, the box model of flex-start/flex-end:
        // mapping in the component alone would leave the device variable carrying a
        // word CSS does not know
        const style = publishedStyle('Svg', {
            src: '/x.svg',
            alignment: 'left',
            responsive: { mobile: { alignment: 'right' } },
        });

        expect(style['--bricks-svg-justify-base']).toBe('flex-start');
        expect(style['--bricks-svg-justify-mobile']).toBe('flex-end');
    });

    it('Svg leaves a margin nobody set undeclared', () => {
        const style = publishedStyle('Svg', { src: '/x.svg' });

        expect(style['--bricks-svg-mt-base']).toBeUndefined();
    });

    it('Svg emits the margin table once a device needs it', () => {
        const style = publishedStyle('Svg', {
            src: '/x.svg',
            responsive: { mobile: { marginTop: 1.6 } },
        });

        expect(style['--bricks-svg-mt-base']).toBe('0rem');
        expect(style['--bricks-svg-mt-mobile']).toBe('1.6rem');
    });
});

describe('Space: the divider adapts without the markup moving', () => {
    it('the divider node stays in place and a device switches it on', () => {
        // A media query switches a `display`; it cannot bring a node into the markup.
        // With the node rendered conditionally, turning the divider on for Mobile alone
        // would do nothing on a page whose base device has none
        const style = publishedStyle('Space', {
            size: 4,
            direction: 'vertical',
            showDivider: false,
            responsive: { mobile: { showDivider: true } },
        });

        expect(style['--bricks-space-divider-display-base']).toBe('none');
        expect(style['--bricks-space-divider-display-mobile']).toBe('block');
    });

    it('the direction moves the size onto the other dimension AND turns the line', () => {
        // The two travel together: a horizontal spacer with a horizontal rule across it
        // is what picking one member of the group apart from the rest would give
        const style = publishedStyle('Space', {
            size: 4,
            direction: 'vertical',
            showDivider: true,
            responsive: { mobile: { direction: 'horizontal' } },
        });

        expect(style['--bricks-space-height-base']).toBe('var(--bricks-space-size)');
        // The width of a vertical spacer stays what the class of the render gives it:
        // an inline `auto` would beat that declaration and collapse an empty spacer
        // standing inside a row
        expect(style['--bricks-space-width-base']).toBe('100%');
        expect(style['--bricks-space-height-mobile']).toBe('auto');
        expect(style['--bricks-space-width-mobile']).toBe('var(--bricks-space-size)');
        expect(style['--bricks-space-divider-border-top-mobile']).toBe('0 none');
        expect(style['--bricks-space-divider-border-left-mobile']).toContain('solid');
    });

    it('a spacer with no divider anywhere keeps the markup it always had', () => {
        const vnode = publishedVNode('Space', { size: 4, direction: 'vertical' });

        expect(vnode.children).toBeFalsy();
    });
});

describe('Slider: the gap adapts through CSS and through Swiper alike', () => {
    it('the published render emits a gap variable per device', () => {
        // The variable lays out the static fallback that goes into the server HTML —
        // the markup a crawler reads before any script runs
        const style = publishedStyle('Slider', {
            spaceBetween: 24,
            responsive: { mobile: { spaceBetween: 8 } },
        });

        expect(style['--bricks-slider-gap-base']).toBe('24px');
        expect(style['--bricks-slider-gap-mobile']).toBe('8px');
    });

    it('the canvas resolves the gap for the sheet it draws', () => {
        expect(
            resolveBlockProps(
                'Slider',
                { spaceBetween: 24, responsive: { mobile: { spaceBetween: 8 } } },
                'mobile'
            ).spaceBetween
        ).toBe(8);
    });
});

describe('the overrides that reach a surface', () => {
    it('a stale override of a property nobody adapts stops at the resolver', () => {
        // Schemas saved while the panel wrote an override for ANY property still carry
        // them. Letting one through would show a picture on the canvas that the
        // published page has no way of showing: a media query cannot swap an address
        const resolved = resolveBlockProps(
            'Media',
            {
                src: '/base.png',
                objectFit: 'cover',
                responsive: { mobile: { src: '/mobile.png', objectFit: 'contain' } },
            },
            'mobile'
        );

        expect(resolved.src).toBe('/base.png');
        expect(resolved.objectFit).toBe('contain');
    });

    it('the canvas binding of a leaf block follows the device for an adaptive property', () => {
        // The mirror of the case above: a property the render DOES adapt reaches the
        // canvas at the value of the sheet being drawn, otherwise the editor would show
        // the base one while the page had already switched
        const props = { objectFit: 'contain', responsive: { mobile: { objectFit: 'fill' } } };

        expect(canvasProps('Media', props, 'mobile').objectFit).toBe('fill');
        expect(canvasProps('Media', props, 'desktop').objectFit).toBe('contain');
    });

    it('a key the block never declared travels through untouched', () => {
        // It belongs to a brick component or to a schema written by a newer version:
        // dropping it here would quietly take data away from someone else
        const resolved = resolveBlockProps(
            'Media',
            { src: '/base.png', responsive: { mobile: { customBrickProp: 'kept' } } },
            'mobile'
        );

        expect(resolved.customBrickProp).toBe('kept');
    });
});

describe('the edges the two paths of a value have to agree on', () => {
    it('a negative margin of Text survives instead of being clamped to zero', () => {
        // The property declares no lower bound, and pulling a block onto its neighbor
        // is a layout rather than a mistake: the rem transform of the paddings would
        // have turned it into `0rem` and moved the block back
        const style = publishedStyle('Text', {
            content: '<p>x</p>',
            marginTop: -1.2,
            responsive: { mobile: { marginTop: -0.4 } },
        });

        expect(style['--bricks-text-mt-base']).toBe('-1.2rem');
        expect(style['--bricks-text-mt-mobile']).toBe('-0.4rem');
    });

    it('a zero gap of a Slider stays zero on the way to the page', () => {
        // Zero is a legal gap, and the component folds it by the same rule: were one
        // side to read it as "no value" the static markup would show a gap the
        // hydrated slider then removed
        const style = publishedStyle('Slider', {
            spaceBetween: 0,
            responsive: { mobile: { spaceBetween: 0 } },
        });

        expect(style['--bricks-slider-gap-base']).toBe('0px');
        expect(style['--bricks-slider-gap-mobile']).toBe('0px');
    });
});
