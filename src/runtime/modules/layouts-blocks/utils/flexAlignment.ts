/**
 * Alignment tables of the Flex block, shared by the SFC and the definition.
 *
 * One table rather than one per surface: `justify` and `align` are a single semantic
 * contract, and a value the canvas lays out one way while a published page lays it out
 * another is a defect, not a difference of surfaces.
 */

// #region Imports
// Types
import type { CSSProperties } from 'vue';
import type { IFlexLayoutProps } from '../types/blockProps';

// Utils
import { readOwnKey } from '../../common/utils/safeRecord';
// #endregion

// #region Constants
/**
 * `satisfies` rather than a plain annotation: it keeps the table exhaustive over the
 * union, so widening `justify` in the props fails to compile until the value is mapped,
 * while the object keeps the literal key types the safe lookup below needs.
 */
const FLEX_JUSTIFY_CSS = {
    start: 'flex-start',
    center: 'center',
    end: 'flex-end',
    'space-between': 'space-between',
    'space-around': 'space-around',
} satisfies Record<IFlexLayoutProps['justify'], NonNullable<CSSProperties['justifyContent']>>;

const FLEX_ALIGN_CSS = {
    stretch: 'stretch',
    start: 'flex-start',
    center: 'center',
    end: 'flex-end',
    baseline: 'baseline',
} satisfies Record<IFlexLayoutProps['align'], NonNullable<CSSProperties['alignItems']>>;
// #endregion

/**
 * Maps a justify value onto the CSS justify-content.
 *
 * The lookup goes through `readOwnKey`: the value arrives from a schema, and a plain
 * `MAP[String(value)]` answers with a member of `Object.prototype` for keys like
 * `constructor` — a function that would then be interpolated into the style attribute.
 *
 * @param value - Alignment value out of props (the schema does not guarantee the type).
 * @returns CSS value for justify-content.
 */
export function mapFlexJustify(value: unknown): NonNullable<CSSProperties['justifyContent']> {
    return readOwnKey(FLEX_JUSTIFY_CSS, String(value)) ?? 'flex-start';
}

/**
 * Maps an align value onto the CSS align-items.
 *
 * @param value - Alignment value out of props (the schema does not guarantee the type).
 * @returns CSS value for align-items.
 */
export function mapFlexAlign(value: unknown): NonNullable<CSSProperties['alignItems']> {
    return readOwnKey(FLEX_ALIGN_CSS, String(value)) ?? 'stretch';
}
