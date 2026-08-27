/**
 * The editor type of a property is inferred by a map, not by a chain of comparisons.
 *
 * Eleven consecutive `if (value.type === literal)` cost the file a `complexity` directive,
 * while the rule of the project prescribes a map. The order matters in the replacement: a
 * declared type wins over a list of options, so the map has to hold exactly the same keys.
 * One key too many (`number`, `string`, `boolean`, `input`) would take the select editor
 * away from a property carrying `vars`.
 *
 * The key arrives from a `.brick.ts` of the consumer, that is from data: read without the
 * own-key check, a type named `constructor` or `toString` would return a method of the
 * prototype.
 */

// #region Imports
// Vitest
import { describe, expect, it, vi } from 'vitest';

// Types
import type { IBrickValues } from '../../src/runtime/modules/common/types/index';
import type { TPropertyType } from '../../src/runtime/modules/common/types/brick';

// Composables
import { useComponentProperties } from '../../src/runtime/modules/builder/core/composables/useComponentProperties';
// #endregion

vi.mock('../../src/runtime/modules/builder/core/composables/useModalOptions', () => ({
    getModalOptions: () => [{ label: 'Modal', value: 'modal-1' }],
}));

// #region Data
/** The declared editor type and the property type of the panel it becomes */
const DECLARED_TYPE_CASES: Array<[string, TPropertyType]> = [
    ['switch', 'switch'],
    ['textarea', 'textarea'],
    ['image', 'image'],
    ['video', 'video'],
    ['inline-content', 'inline-content'],
    ['tags', 'tags'],
    ['image-gallery', 'image-gallery'],
    ['accordion-items', 'accordion-items'],
    ['color', 'color'],
    ['array', 'array'],
    ['object', 'object'],
    ['select', 'select'],
    ['tabs', 'select'],
    ['modal-select', 'select'],
];
// #endregion

// #region Helpers
/**
 * The type of the single property, as the panel is going to see it.
 *
 * @param value - Declaration of the property in the brick file.
 */
function resolveType(value: IBrickValues): TPropertyType | undefined {
    const { brickValuesToProperties } = useComponentProperties();

    return brickValuesToProperties({ prop: value })[0]?.type;
}
// #endregion

describe('inferring the type of a property from the declaration of a brick file', () => {
    it.each(DECLARED_TYPE_CASES)('a declared %s gives %s', (declared, expected) => {
        expect(resolveType({ type: declared })).toBe(expected);
    });

    it('a declared type wins over a list of options', () => {
        // Otherwise a select with vars would stop differing from an input with vars, and
        // with it every other declared type that carries samples of its values
        expect(resolveType({ type: 'image', vars: ['a', 'b'] })).toBe('image');
    });

    it('an undeclared type with a list of options becomes a select', () => {
        expect(resolveType({ type: 'number', vars: [1, 2] })).toBe('select');
        expect(resolveType({ type: 'input', vars: ['a'] })).toBe('select');
    });

    it('with no declaration and no options the type comes from the default value', () => {
        expect(resolveType({ type: 'input', default: true })).toBe('boolean');
        expect(resolveType({ type: 'input', default: 4 })).toBe('number');
        expect(resolveType({ type: 'input', default: ['a'] })).toBe('array');
        expect(resolveType({ type: 'input', default: { a: 1 } })).toBe('object');
        expect(resolveType({ type: 'input', default: 'text' })).toBe('string');
    });

    it('an unknown type degrades softly instead of refusing', () => {
        expect(resolveType({ type: 'something-new' })).toBe('string');
    });

    it('a type named after a member of Object.prototype picks up no method of it', () => {
        // A plain index into the map would return the `constructor`/`toString` function,
        // and the panel would get a piece of the prototype in place of a property type
        expect(resolveType({ type: 'constructor' })).toBe('string');
        expect(resolveType({ type: 'toString', default: 2 })).toBe('number');
        expect(resolveType({ type: 'hasOwnProperty', vars: ['a'] })).toBe('select');
    });
});
