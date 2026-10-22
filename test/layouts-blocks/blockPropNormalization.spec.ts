// #region Imports
// Types
import type {
    IBricksComponent,
    TBricksDeviceKey,
} from '../../src/runtime/modules/common/types/brick';
import type { IBlockRenderContext } from '../../src/runtime/modules/layouts-blocks/types/registry';

// Vitest
import { describe, expect, it } from 'vitest';

// Registry
import {
    BLOCK_REGISTRY,
    resolveBlockProps,
    resolveCanvasBind,
} from '../../src/runtime/modules/layouts-blocks/registry';

// Utils
import {
    mapFlexAlign,
    mapFlexJustify,
} from '../../src/runtime/modules/layouts-blocks/utils/flexAlignment';
import { coerceBlockProps } from '../../src/runtime/modules/layouts-blocks/utils/propertyCoercion';
import { normalizeSpaceSize } from '../../src/runtime/modules/layouts-blocks/utils/spaceSize';

// Definitions
import { blockFlexDefinition } from '../../src/runtime/modules/layouts-blocks/components/blockFlex.definition';
import { blockGridDefinition } from '../../src/runtime/modules/layouts-blocks/components/blockGrid.definition';
import { blockSectionDefinition } from '../../src/runtime/modules/layouts-blocks/components/blockSection.definition';
import { blockSpaceDefinition } from '../../src/runtime/modules/layouts-blocks/components/blockSpace.definition';
// #endregion

/**
 * Builds the inline style of a published layout render out of schema props.
 *
 * @param definition - Definition of the block being rendered.
 * @param props - Props of the schema component.
 * @returns Style object of the root node.
 */
function renderPublishedStyle(
    definition: typeof blockSpaceDefinition,
    props: Record<string, unknown>
): Record<string, string> {
    const component = {
        id: 'block-1',
        componentName: definition.name,
        props,
    } as unknown as IBricksComponent;

    const vnode = definition.renderPublished!({
        component,
        definition,
        extraClasses: [],
        extraAttrs: {},
        styles: {},
        renderChild: () => null,
        getChildComponents: () => [],
    } as unknown as IBlockRenderContext);

    return (vnode.props?.style ?? {}) as Record<string, string>;
}

/**
 * Builds the props of the root node of a published layout render out of schema props.
 *
 * @param blockName - Name of the block in the registry.
 * @param props - Props of the schema component.
 * @returns Props of the root vnode.
 */
function renderPublishedProps(
    blockName: string,
    props: Record<string, unknown>
): Record<string, unknown> {
    const definition = BLOCK_REGISTRY[blockName]!;
    const component = {
        id: 'block-1',
        componentName: definition.name,
        props,
    } as unknown as IBricksComponent;

    const vnode = definition.renderPublished!({
        component,
        definition,
        extraClasses: [],
        extraAttrs: {},
        styles: {},
        renderChild: () => null,
        getChildComponents: () => [],
    } as unknown as IBlockRenderContext);

    return (vnode.props ?? {}) as Record<string, unknown>;
}

/**
 * Builds the canvas binding of a block the way the builder does.
 *
 * `boundProps` repeats what BuilderCanvasItem hands over — a copy of the RAW schema
 * props with the builder-only keys dropped. Calling `canvasBind` directly instead would
 * walk past the normalization in the dispatcher and test a path the application does
 * not have.
 *
 * @param blockName - Name of the block in the registry.
 * @param props - Props of the schema component.
 * @param viewport - Viewport the canvas is showing.
 * @returns Props bound onto the canvas component.
 */
function renderCanvasProps(
    blockName: string,
    props: Record<string, unknown>,
    viewport: TBricksDeviceKey = 'desktop'
): Record<string, unknown> {
    const definition = BLOCK_REGISTRY[blockName]!;
    const { slot: _slot, fullWidth: _fullWidth, ...boundProps } = props;

    return resolveCanvasBind(definition, {
        component: {
            id: 'block-1',
            componentName: definition.name,
            props,
        } as unknown as IBricksComponent,
        layoutProps: resolveBlockProps(blockName, props, viewport),
        boundProps,
        childComponents: [],
        renderChild: () => null,
        t: (key: string) => key,
    });
}

/**
 * Builds the inline style of the published Space render out of schema props.
 *
 * @param props - Props of the schema component.
 * @returns Style object of the root node.
 */
function renderPublishedSpaceStyle(props: Record<string, unknown>): Record<string, string> {
    const component = {
        id: 'space-1',
        componentName: 'Space',
        props,
    } as unknown as IBricksComponent;

    const vnode = blockSpaceDefinition.renderPublished!({
        component,
        definition: blockSpaceDefinition,
        extraClasses: [],
        extraAttrs: {},
        styles: {},
        renderChild: () => null,
        getChildComponents: () => [],
    } as unknown as IBlockRenderContext);

    return (vnode.props?.style ?? {}) as Record<string, string>;
}

describe('flex alignment maps', () => {
    it('maps a declared value and falls back for an unknown one', () => {
        expect(mapFlexJustify('end')).toBe('flex-end');
        expect(mapFlexAlign('baseline')).toBe('baseline');
        expect(mapFlexJustify('sideways')).toBe('flex-start');
        expect(mapFlexAlign(undefined)).toBe('stretch');
    });

    it('a key of Object.prototype falls back instead of leaking an inherited member', () => {
        expect(mapFlexJustify('constructor')).toBe('flex-start');
        expect(mapFlexAlign('toString')).toBe('stretch');
    });
});

describe('space size normalization', () => {
    it('reads a bare number and a numeric string as rem', () => {
        expect(normalizeSpaceSize(2.4)).toBe('2.4rem');
        expect(normalizeSpaceSize('2.4')).toBe('2.4rem');
    });

    it('a declared zero survives the published render instead of becoming the default', () => {
        expect(normalizeSpaceSize(0)).toBe('0rem');
        expect(renderPublishedSpaceStyle({ size: 0 })['--bricks-space-size-base']).toBe('0rem');
    });

    // The canvas coerces `size` through the property definition before binding the
    // block, while the published render reads the RAW schema props. Every value that
    // is not already a clean number is where the two used to part ways: a blank
    // string and null became 0rem in the editor and the default on the page, and a
    // negative number was clamped only in the editor.
    it.each([
        ['a missing value', undefined, '2.4rem'],
        ['null', null, '0rem'],
        ['a blank string', '', '0rem'],
        ['whitespace', '   ', '0rem'],
        ['a negative number', -1, '0rem'],
        ['a string with a unit', '24px', '2.4rem'],
        ['exponent notation', '1e3', '1000rem'],
        ['a plain number', 999, '999rem'],
    ])('%s lands the same on the canvas and on a published page', (_label, raw, expected) => {
        const canvasSize = resolveBlockProps('Space', { size: raw }, 'desktop').size;

        expect(normalizeSpaceSize(canvasSize)).toBe(expected);
        expect(renderPublishedSpaceStyle({ size: raw })['--bricks-space-size-base']).toBe(expected);
    });
});

// The published render reads the RAW schema props while the canvas gets them through
// the registry, which coerces every declared property against its definition. Each row
// below is a value where only one of the two used to consult the definition: a broken
// `columns` reached the page as `repeat(Infinity, 1fr)`, and a broken `gap` collapsed to
// zero there while the editor kept the declared default.
describe('published layout props go through the same coercion as the canvas', () => {
    it.each([
        ['a non-numeric value takes the declared default', 'columns', 'bad', 4],
        ['a non-finite value takes the declared default', 'columns', Number.POSITIVE_INFINITY, 4],
        ['a value below the bound is clamped', 'columns', -3, 1],
    ])('%s', (_label, key, raw, expected) => {
        const canvas = resolveBlockProps('Grid', { [key]: raw }, 'desktop');

        expect(canvas[key]).toBe(expected);
        expect(renderPublishedStyle(blockGridDefinition, { [key]: raw })).toMatchObject({
            '--bricks-grid-columns-base': String(expected),
        });
    });

    it('a device override is coerced too, not only the base value', () => {
        const props = { columns: 4, responsive: { mobile: { columns: Number.POSITIVE_INFINITY } } };

        expect(resolveBlockProps('Grid', props, 'mobile').columns).toBe(4);
        expect(
            renderPublishedStyle(blockGridDefinition, props)['--bricks-grid-columns-mobile']
        ).toBe('4');
    });

    it('an upper bound is honored on a published page: divider width stops at its max', () => {
        expect(resolveBlockProps('Space', { dividerWidth: 999 }, 'desktop').dividerWidth).toBe(10);

        const vnode = blockSpaceDefinition.renderPublished!({
            component: {
                id: 'space-1',
                componentName: 'Space',
                props: { dividerWidth: 999, showDivider: true, direction: 'vertical' },
            } as unknown as IBricksComponent,
            definition: blockSpaceDefinition,
            extraClasses: [],
            extraAttrs: {},
            styles: {},
            renderChild: () => null,
            getChildComponents: () => [],
        } as unknown as IBlockRenderContext);
        // The line of the divider is described by a variable of the root: the node
        // itself stays in the markup on every device and reads whatever the rule of the
        // active step handed it
        const style = (vnode.props?.style ?? {}) as Record<string, string>;

        expect(style['--bricks-space-divider-border-top-base']).toContain('10px');
    });

    it('a value outside the declared options folds to the default, not into the CSS', () => {
        // `computeFlexVars` interpolates `direction` straight into a custom property,
        // so an unchecked value from the schema shipped as
        // `--bricks-flex-direction-base: totally-bogus` while the canvas had already
        // folded it to the default. The rendered layout survived it — a custom property
        // that invalid makes the `flex-direction` declaration fall back to its initial
        // value — but the published markup carried a value the block never accepted.
        const props = { direction: 'totally-bogus' };

        expect(resolveBlockProps('Flex', props, 'desktop').direction).toBe('row');
        expect(renderPublishedStyle(blockFlexDefinition, props)).toMatchObject({
            '--bricks-flex-direction-base': 'row',
        });
    });

    it('folds select and boolean properties, not only numbers', () => {
        const coerced = coerceBlockProps(blockFlexDefinition.properties, {
            direction: 'sideways',
            justify: 'nowhere',
            wrap: 'yes',
            gap: 'bad',
        });

        expect(coerced).toMatchObject({
            direction: 'row',
            justify: 'start',
            wrap: true,
            gap: 24,
        });
    });
});

// Six blocks used to read the raw schema on one surface or on both. The canvas is
// assembled here the way the builder assembles it, with `boundProps` built out of the
// raw props: Text, Media and Svg spread that object, so it — and not `resolveBlockProps`
// — is what their canvas component really receives. Section, Slider and Accordion pass
// the resolved `layoutProps` on instead, which is why the two groups broke differently:
// the first was raw on both surfaces — bar `width`, `height` and `borderRadius`, which
// the Media binding has always overwritten with the resolved values — while the second
// disagreed with the page.
describe('every layout block folds its props the same way on both surfaces', () => {
    it('Section: a broken padding stops reaching the page as Infinityrem', () => {
        const props = {
            paddingTop: Number.POSITIVE_INFINITY,
            paddingBottom: 'bad',
            paddingX: -5,
            responsive: { mobile: { paddingTop: Number.POSITIVE_INFINITY } },
        };
        const style = renderPublishedStyle(blockSectionDefinition, props);

        expect(style['--bricks-section-pt-base']).toBe('4rem');
        expect(style['--bricks-section-pb-base']).toBe('4rem');
        expect(style['--bricks-section-px-base']).toBe('0rem');
        // The overrides are folded too, not only the base level
        expect(style['--bricks-section-pt-mobile']).toBe('4rem');
    });

    it('Slider: the props of the block and its variable table fold together', () => {
        const props = {
            slidesPerView: Number.POSITIVE_INFINITY,
            spaceBetween: 'bad',
            captionPosition: 'middle',
            responsive: { mobile: { slidesPerView: -4 } },
        };
        const published = renderPublishedProps('Slider', props);
        const layoutProps = published.layoutProps as Record<string, unknown>;
        const publishedStyle = published.style as Record<string, string>;
        const canvasStyle = renderCanvasProps('Slider', props).style as Record<string, string>;

        expect(layoutProps.slidesPerView).toBe(3);
        expect(layoutProps.spaceBetween).toBe(16);
        expect(layoutProps.captionPosition).toBe('top');
        // The captions list survives the fold: `object` is not a coercible type
        expect(layoutProps.captions).toEqual([]);
        expect(publishedStyle['--bricks-slider-spv-base']).toBe('3');
        expect(publishedStyle['--bricks-slider-spv-mobile']).toBe('1');
        expect(canvasStyle).toEqual(publishedStyle);
    });

    it('Text: the size variables agree with the canvas instead of both being broken', () => {
        const props = {
            content: '<p>text</p>',
            fontSize: Number.POSITIVE_INFINITY,
            marginTop: 'bad',
        };
        const published = renderPublishedProps('Text', props);
        const canvas = renderCanvasProps('Text', props);

        expect(published.fontSize).toBe(1.8);
        expect(published.marginTop).toBe(0);
        expect(canvas.fontSize).toBe(1.8);
        expect(canvas.marginTop).toBe(0);
        expect((published.style as Record<string, string>)['--bricks-text-font-size-base']).toBe(
            '1.8rem'
        );
        expect(canvas.style).toEqual(published.style);
    });

    // The legacy branch is what the coercion order protects: fold the RAW props, and a
    // schema with no fontSize of its own keeps the sizes the former @container queries
    // gave it. Lay in the defaults first and the branch switches off, resizing the text
    // of every existing page on narrow devices at once.
    it('Text: a schema without a fontSize of its own keeps the legacy table', () => {
        const props = { content: '<p>text</p>' };
        const published = renderPublishedProps('Text', props);

        expect(published.style).toEqual({
            '--bricks-text-font-size-base': '1.8rem',
            '--bricks-text-font-size-mobile': '1.4rem',
            '--bricks-text-font-size-tablet': '1.6rem',
        });
        expect(renderCanvasProps('Text', props).style).toEqual(published.style);
        expect('fontSize' in published).toBe(false);
    });

    it('Media: a type outside the options no longer picks a branch of the block', () => {
        const props = {
            type: 'audio',
            objectFit: 'nonsense',
            loadMode: 'weird',
            eagerLoad: 'yes',
            width: '32rem',
        };
        const published = renderPublishedProps('Media', props);
        const canvas = renderCanvasProps('Media', props);

        for (const surface of [published, canvas]) {
            expect(surface.type).toBe('image');
            expect(surface.objectFit).toBe('cover');
            expect(surface.loadMode).toBe('config');
            expect(surface.eagerLoad).toBe(true);
        }

        // An `input` property is not a coercible type: the declared size survives and
        // still reaches the variable it feeds
        expect((published.style as Record<string, string>)['--bricks-media-width-base']).toBe(
            '32rem'
        );
    });

    it('Accordion: the folded props reach the block, defaults laid in after', () => {
        const props = {
            allowMultiple: 'yes',
            initialOpenIndex: 'x',
            gap: -4,
            borderRadius: Number.POSITIVE_INFINITY,
        };
        const layoutProps = renderPublishedProps('Accordion', props).layoutProps as Record<
            string,
            unknown
        >;
        const canvasProps = renderCanvasProps('Accordion', props).layoutProps as Record<
            string,
            unknown
        >;

        expect(layoutProps).toMatchObject({
            allowMultiple: true,
            initialOpenIndex: -1,
            gap: 0,
            borderRadius: 0.8,
        });
        // A property the schema never carried still gets its default
        expect(layoutProps.animationDuration).toBe(250);
        expect(canvasProps).toMatchObject({
            allowMultiple: true,
            initialOpenIndex: -1,
            gap: 0,
            borderRadius: 0.8,
        });
    });

    it('Svg: an alignment outside the options folds on both surfaces', () => {
        const props = {
            alignment: 'sideways',
            marginTop: Number.POSITIVE_INFINITY,
            marginBottom: 'bad',
            width: '6rem',
        };
        const published = renderPublishedProps('Svg', props);
        const canvas = renderCanvasProps('Svg', props);

        for (const surface of [published, canvas]) {
            expect(surface.alignment).toBe('left');
            expect(surface.marginTop).toBe(0);
            expect(surface.marginBottom).toBe(0);
        }

        expect((published.style as Record<string, string>)['--bricks-media-width-base']).toBe(
            '6rem'
        );
    });

    // A property no render adapts keeps its base value on both surfaces even when an
    // override sits in the schema: such overrides exist in pages saved while the panel
    // still wrote one for ANY property, and the published page cannot honor them — a
    // media query has no way of swapping the alt text of a picture.
    it('the canvas binding keeps to the base values of a non-responsive property', () => {
        const props = { alt: 'base alt', responsive: { mobile: { alt: 'mobile alt' } } };

        expect(renderCanvasProps('Media', props, 'mobile').alt).toBe('base alt');
        expect(renderPublishedProps('Media', props).alt).toBe('base alt');
    });

    // The other half of that rule: a size IS adapted per device by the published render,
    // so the binding of a block that carries one has to pull it out of the resolved
    // props. Media always did; Svg kept the base value and stayed at the desktop size on
    // a narrow sheet while the page had already shrunk it.
    it.each([
        ['Media', 'width', '10rem', '5rem'] as const,
        ['Media', 'height', 'auto', '20rem'] as const,
        ['Svg', 'width', '4.8rem', '2rem'] as const,
        ['Svg', 'height', '4.8rem', '3rem'] as const,
    ])('%s follows the device override of its %s on the canvas', (block, axis, base, override) => {
        const props = { [axis]: base, responsive: { mobile: { [axis]: override } } };

        expect(renderCanvasProps(block, props, 'mobile')[axis]).toBe(override);
        expect(renderCanvasProps(block, props, 'desktop')[axis]).toBe(base);
        // The published render reaches the same size through its per-device variable
        expect(
            (renderPublishedProps(block, props).style as Record<string, string>)[
                `--bricks-media-${axis}-mobile`
            ]
        ).toBe(override);
    });

    // Fields outside `properties` are copied through untouched: they carry no
    // descriptor, and dropping them would empty the progressive loading of a picture
    it('a field outside the declared properties survives the fold', () => {
        const published = renderPublishedProps('Media', {
            previewSrc: 'preview.webp',
            naturalWidth: 800,
        });

        expect(published.previewSrc).toBe('preview.webp');
        expect(published.naturalWidth).toBe(800);
    });
});
