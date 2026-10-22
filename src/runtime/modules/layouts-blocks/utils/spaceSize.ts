/**
 * Size normalization of the Space block, shared by the SFC and the definition.
 */

// #region Imports
// Constants
import { BLOCK_SPACE_DEFAULT_SIZE, BLOCK_SPACE_MIN_SIZE } from '../constants/blockSpace';

// Utils
import { coerceNumberProperty } from './propertyCoercion';
// #endregion

/**
 * Brings a `size` value to a CSS length.
 *
 * `size` is declared a `number` property, so its unit is always rem and the value goes
 * through the very coercion the registry applies on the canvas. Anything else — a
 * string with a unit, a blank string, `null`, a negative number — folds exactly as it
 * folds for the editor, because the published render reads the RAW schema props and a
 * second set of rules here would show one size in the builder and another on the page.
 *
 * @param value - Value out of the schema or out of a device override.
 * @returns CSS length in rem, never an empty string.
 */
export function normalizeSpaceSize(value: unknown): string {
    const size = coerceNumberProperty(value, BLOCK_SPACE_DEFAULT_SIZE, BLOCK_SPACE_MIN_SIZE);

    return `${size}rem`;
}
