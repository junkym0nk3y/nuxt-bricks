/**
 * Coercing a number-looking string works the same for a base prop and for a per-device
 * override.
 *
 * The eleven-line block — trim, the empty string, the pattern, the NaN check — used to be
 * written twice, once in each action. The copies could part ways in silence: an edit of
 * the pattern in one branch would leave the other with the old behavior, and all that
 * separates them is where the value lands, in `props` or in `props.responsive[device]`.
 *
 * The store is the last heuristic border: the panel already coerces by the declared type
 * of the property, but a generic input, a direct call of the store and the other editors
 * reach the props through these two actions.
 */

// #region Imports
// Vitest
import { describe, expect, it, vi } from 'vitest';

// Types
import type { TBrickPropValue } from '../../src/runtime/modules/common/types/brick';

// Utils
import { propertyActions } from '../../src/runtime/modules/builder/core/stores/actions/properties';
// #endregion

// #region Data
/**
 * What the coercion is expected to do. What stays a string is not arbitrary: the pattern
 * accepts plain decimal notation only, so an exponent, a leading plus and a bare dot do
 * not pass it and have to reach the schema untouched, whitespace included.
 */
const COERCION_CASES: Array<{ label: string; input: TBrickPropValue; expected: TBrickPropValue }> =
    [
        { label: 'an integer as a string', input: '42', expected: 42 },
        { label: 'a fraction as a string', input: '1.25', expected: 1.25 },
        { label: 'a negative as a string', input: '-3', expected: -3 },
        { label: 'a number in whitespace', input: '  1.25  ', expected: 1.25 },
        { label: 'the empty string', input: '', expected: '' },
        { label: 'a string of whitespace', input: '   ', expected: '' },
        { label: 'an exponent', input: '1e2', expected: '1e2' },
        { label: 'a leading plus', input: '+1', expected: '+1' },
        { label: 'a bare leading dot', input: '.5', expected: '.5' },
        { label: 'a dot with no fractional part', input: '1.', expected: '1.' },
        {
            label: 'a non-number stays untouched, whitespace included',
            input: ' 12px ',
            expected: ' 12px ',
        },
        { label: 'a boolean passes as it is', input: true, expected: true },
        { label: 'a number passes as it is', input: 7, expected: 7 },
    ];
// #endregion

// #region Helpers
/**
 * Minimal store holding one component: the history entry is debounced and has nothing to
 * do with the coercion of a value.
 *
 * @param props - Initial props of the component.
 */
function makeStore(props: Record<string, unknown> = {}) {
    const component = { id: 'c1', props };

    return {
        component,
        getComponentById: () => component,
        saveToHistory: vi.fn(),
    };
}
// #endregion

describe('coercing the value of a property in the store', () => {
    it.each(COERCION_CASES)('a base prop: $label', ({ input, expected }) => {
        const store = makeStore();

        propertyActions.updateComponentProp.call(store as never, 'c1', 'size', input);

        expect(store.component.props.size).toStrictEqual(expected);
    });

    it.each(COERCION_CASES)('a per-device override: $label', ({ input, expected }) => {
        const store = makeStore();

        propertyActions.updateComponentResponsiveProp.call(
            store as never,
            'c1',
            'mobile' as never,
            'size',
            input
        );

        const responsive = store.component.props.responsive as Record<
            string,
            Record<string, unknown>
        >;
        expect(responsive.mobile?.size).toStrictEqual(expected);
    });
});
