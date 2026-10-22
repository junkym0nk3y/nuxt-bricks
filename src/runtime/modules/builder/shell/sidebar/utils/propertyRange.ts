// #region Imports
// Types
import type { IPropertyDefinition } from '../../../../common/types/brick';
// #endregion

/**
 * Pins a numeric value to the min/max range a property declares.
 *
 * Rounding is deliberately NOT part of this: the spacing editor rounds to one decimal
 * place, and the grid size editor must not — a rounding step would make the step of the
 * grid fractional. Where rounding is needed it happens around this call, and which side
 * of it wins is the caller's decision — see `clampValue` in `useSpacingEditor`.
 *
 * A `min` above `max` is left as it is instead of being reported: `max` is applied last,
 * so such a declaration pins the value to `max`. That is the behavior the editors have
 * had, and a refusal here would break the panel over a brick file rather than over the
 * value someone typed.
 *
 * @param value - Candidate value.
 * @param property - Property being edited, the source of the bounds.
 * @returns The value inside the range of the property.
 */
export function clampToPropertyRange(
    value: number,
    property: Pick<IPropertyDefinition, 'min' | 'max'>
): number {
    const { min, max } = property;
    let next = value;

    if (typeof min === 'number') {
        next = Math.max(min, next);
    }

    if (typeof max === 'number') {
        next = Math.min(max, next);
    }

    return next;
}
