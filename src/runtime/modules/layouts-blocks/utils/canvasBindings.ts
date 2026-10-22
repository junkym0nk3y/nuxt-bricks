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

/**
 * Canvas binding of a container block: the props of the drawn device, the id the drop
 * zone of the block reports, and the layout attribute the generated CSS rules select by.
 * The registry binds every container without a binding of its own this way, and a
 * container that adds props to it starts from here, so the two never drift apart.
 *
 * @param ctx - Canvas binding context.
 * @param blockName - Name of the block definition.
 * @returns Props for the canvas component of the block.
 */
export function bindLayoutContainer(
    ctx: IBlockCanvasContext,
    blockName: string
): Record<string, unknown> {
    return {
        layoutProps: ctx.layoutProps,
        layoutId: ctx.component.id,
        'data-bricks-layout': blockName.toLowerCase(),
    };
}
