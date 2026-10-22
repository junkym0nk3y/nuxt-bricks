/**
 * @vitest-environment happy-dom
 *
 * Pinning a number to the range of a property is one helper for two editors.
 *
 * The same pair of Math.max/Math.min used to be written twice, in the grid size editor
 * and in the spacing composable. The copies differed in one thing — spacing also rounds
 * to one decimal place — and that is exactly why the rounding did not move into the
 * shared helper: it would make the step of the grid fractional.
 *
 * Which side of the clamp the rounding sits on is the caller's decision, and for spacing
 * the rounding has the last word. The price is named at `clampValue`: a bound off the
 * 0.1 grid can be overshot by up to 0.05.
 */

// #region Imports
// Vitest
import { describe, expect, it, vi } from 'vitest';

// Types
import type {
    IComponentVariant,
    ISpacingStepperSlot,
} from '../../src/runtime/modules/builder/shell/sidebar/components/property-editors/types';
import type { IPropertyDefinition } from '../../src/runtime/modules/common/types/brick';

// Vue
import { mount } from '@vue/test-utils';

// Utils
import { clampToPropertyRange } from '../../src/runtime/modules/builder/shell/sidebar/utils/propertyRange';
// #endregion

// #region Mocks
vi.mock('vue-i18n', () => ({
    useI18n: () => ({ t: (key: string) => key, te: () => false }),
}));
// #endregion

// #region Helpers
/**
 * Declaration of a numeric property with optional bounds.
 *
 * @param name - Name of the property.
 * @param bounds - Bounds of the range.
 */
function buildProperty(
    name: string,
    bounds: Partial<Pick<IPropertyDefinition, 'min' | 'max' | 'step'>> = {}
): IPropertyDefinition {
    return {
        name,
        type: 'number',
        label: name,
        default: 0,
        ...bounds,
    };
}

/**
 * Property variant as the editors receive it.
 *
 * @param property - Declaration of the property.
 * @param value - Current value.
 */
function buildVariant(property: IPropertyDefinition, value: number): IComponentVariant {
    return { label: property.name, value, disabled: false, property };
}
// #endregion

describe('clampToPropertyRange', () => {
    it('pins to either bound and lets a value inside the range through', () => {
        const property = buildProperty('columns', { min: 2, max: 4 });

        expect(clampToPropertyRange(1, property)).toBe(2);
        expect(clampToPropertyRange(8, property)).toBe(4);
        expect(clampToPropertyRange(3, property)).toBe(3);
    });

    it('passes the value through when no bound is declared', () => {
        expect(clampToPropertyRange(-5, buildProperty('columns'))).toBe(-5);
        expect(clampToPropertyRange(99, buildProperty('columns', { min: 1 }))).toBe(99);
        expect(clampToPropertyRange(-99, buildProperty('columns', { max: 4 }))).toBe(-99);
    });

    it('does not round: the rounding belongs to spacing, not to the range', () => {
        // Rounding here would make the step of the grid fractional
        expect(clampToPropertyRange(2.25, buildProperty('paddingTop', { min: 0, max: 10 }))).toBe(
            2.25
        );
    });
});

describe('the grid size editor pins a click to the range of the property', () => {
    it('a click on a cell above max writes max rather than the number of the cell', async () => {
        const GridSizeEditor = (
            await import('../../src/runtime/modules/builder/shell/sidebar/components/property-editors/BuilderShellSidebarPropertyGridSizeEditor.vue')
        ).default;
        const columnsProperty = buildProperty('columns', { min: 1, max: 4 });
        const rowsProperty = buildProperty('rows', { min: 1, max: 3 });
        const handleChangeValues = vi.fn();

        const wrapper = mount(GridSizeEditor, {
            props: {
                columnsVariant: buildVariant(columnsProperty, 2),
                rowsVariant: buildVariant(rowsProperty, 2),
                handleChangeValues,
            },
            // Icons arrive through the auto-import of Nuxt, which vitest does not have
            global: { stubs: { BricksIcon: true } },
        });

        // The eighth column of the sixth row: the grid always draws 8×6, while the
        // property declared 4×3
        await wrapper.get('button[aria-label="8 × 6"]').trigger('click');

        expect(handleChangeValues).toHaveBeenCalledWith(columnsProperty, 4);
        expect(handleChangeValues).toHaveBeenCalledWith(rowsProperty, 3);
    });
});

describe('the spacing editor pins and rounds a step', () => {
    it('a step past the upper bound writes the bound', async () => {
        const { useSpacingEditor } =
            await import('../../src/runtime/modules/builder/shell/sidebar/composables/useSpacingEditor');
        const property = buildProperty('paddingTop', { min: 0, max: 3, step: 0.2 });
        const handleChangeValues = vi.fn();

        const editor = useSpacingEditor({
            items: [buildVariant(property, 2.9)],
            handleChangeValues,
        } as never);

        editor.handleStep(editor.topSlot.value as ISpacingStepperSlot, 1);

        // 2.9 plus 0.2 is 3.1 with the floating point noise of the platform: the clamp
        // brings it to 3, and the rounding takes the noise off
        expect(handleChangeValues).toHaveBeenCalledWith(property, 3);
    });

    it('a step down below the lower bound writes the bound', async () => {
        const { useSpacingEditor } =
            await import('../../src/runtime/modules/builder/shell/sidebar/composables/useSpacingEditor');
        const property = buildProperty('paddingTop', { min: 0.4, max: 10, step: 0.2 });
        const handleChangeValues = vi.fn();

        const editor = useSpacingEditor({
            items: [buildVariant(property, 0.4)],
            handleChangeValues,
        } as never);

        editor.handleStep(editor.topSlot.value as ISpacingStepperSlot, -1);

        expect(handleChangeValues).toHaveBeenCalledWith(property, 0.4);
    });

    it('overshoots a bound that is off the 0.1 grid, and that is the accepted trade', () => {
        // Recorded rather than desired: the rounding has the last word, so a `max: 3.25`
        // stores 3.3. The other order would store 3.25 exactly — an off-grid number the
        // field displays as "3.3", parting what is shown from what is held. No block of
        // the package declares such a bound.
        const property = buildProperty('paddingTop', { min: 0, max: 3.25 });

        expect(Math.round(clampToPropertyRange(3.4, property) * 10) / 10).toBe(3.3);
    });
});
