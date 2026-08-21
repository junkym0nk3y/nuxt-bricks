// #region Imports
// Types
import type { IBlockCanvasContext } from '../types/registry';
// #endregion

/**
 * Canvas binding of a leaf block with inline editing (Title/Text/Svg):
 * boundProps plus componentId — the editor needs the id for the double click.
 *
 * @param ctx - Canvas binding context.
 * @returns Props for the canvas component of the block.
 */
export function bindBoundPropsWithComponentId(ctx: IBlockCanvasContext): Record<string, unknown> {
    return { componentId: ctx.component.id, ...ctx.boundProps };
}
