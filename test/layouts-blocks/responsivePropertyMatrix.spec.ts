/**
 * The exact set of properties every built-in block adapts per device.
 *
 * The flag is a contract with three readers: the properties panel decides by it
 * whether a change goes into `props.responsive[device]`, the render of the block has
 * to carry a mechanic for it, and the guide of the builder describes the same list to
 * the user in prose. When the three disagree the failure is silent in the worst way —
 * the panel writes an override, the editor shows it applied, and the published page
 * keeps the base value.
 *
 * Hence a matrix written out by hand rather than derived from the definitions: it has
 * to fail when a flag appears or disappears, so that whoever moved it goes and looks
 * at the render and at the article of the guide.
 */

// #region Imports
// Vitest
import { describe, expect, it } from 'vitest';

// Registry
import { BLOCK_REGISTRY } from '../../src/runtime/modules/layouts-blocks/registry';
// #endregion

// #region Data
/**
 * Block name → the properties it adapts per device, in the order of the definition.
 *
 * A block absent from the table adapts nothing: Accordion is the one such block today,
 * and its `responsiveMode: 'none'` says so on its own side.
 */
const RESPONSIVE_MATRIX: Record<string, string[]> = {
    Section: [
        'backgroundColor',
        'backgroundImage',
        'paddingTop',
        'paddingBottom',
        'paddingX',
        'borderRadius',
        'minHeight',
        'maxWidth',
    ],
    Grid: [
        'columns',
        'rows',
        'gap',
        'variant',
        'rowHeight',
        'minRowHeight',
        'paddingX',
        'paddingY',
    ],
    Flex: ['direction', 'justify', 'align', 'gap', 'wrap', 'paddingX', 'paddingY'],
    Space: [
        'size',
        'direction',
        'showDivider',
        'dividerColor',
        'dividerWidth',
        'dividerStyle',
        'dividerMarginX',
    ],
    Text: ['fontSize', 'marginTop', 'marginBottom'],
    Media: ['objectFit', 'width', 'height', 'borderRadius'],
    Svg: ['width', 'height', 'alignment', 'marginTop', 'marginBottom'],
    Slider: ['spaceBetween', 'slidesPerView'],
    Accordion: [],
};
// #endregion

// #region Methods
/**
 * The properties of a block carrying the responsive flag.
 *
 * @param name - Block name in the registry.
 * @returns Names of the adaptive properties, in the order of the definition.
 */
function responsiveNames(name: string): string[] {
    return BLOCK_REGISTRY[name].properties
        .filter((property) => property.responsive === true)
        .map((property) => property.name);
}
// #endregion

describe('the adaptive properties of the built-in blocks', () => {
    it('the matrix covers every block of the registry', () => {
        // A block missing from the table would leave its flags unwatched, and an
        // unwatched flag is exactly how the panel and the render drifted apart
        expect(Object.keys(BLOCK_REGISTRY).sort()).toEqual(Object.keys(RESPONSIVE_MATRIX).sort());
    });

    it.each(Object.entries(RESPONSIVE_MATRIX))(
        '%s adapts exactly the listed properties',
        (name, expected) => {
            expect(responsiveNames(name)).toEqual(expected);
        }
    );

    it('a block that adapts something declares it can', () => {
        // `responsiveMode` is the capability of the block: the device tabs of the
        // panel appear by it. A property flagged inside a block that declares 'none'
        // would be settable nowhere
        for (const [name, expected] of Object.entries(RESPONSIVE_MATRIX)) {
            if (expected.length > 0) {
                expect(BLOCK_REGISTRY[name].responsiveMode).toBe('all');
            }
        }
    });
});
