// #region Imports
// Types
import type { IBricksComponent } from '../../src/runtime/modules/common/types/brick';
import type { IBlockRenderContext } from '../../src/runtime/modules/layouts-blocks/types/registry';

// Vitest
import { describe, expect, it } from 'vitest';

// Registry
import { resolveBlockProps } from '../../src/runtime/modules/layouts-blocks/registry';

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
        const divider = (vnode.children as { props?: { style?: Record<string, string> } }[])[0];

        expect(divider.props?.style?.borderTop).toContain('10px');
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
