// #region Imports
// Types
import type { IBlockCanvasContext } from '../types/registry';
// #endregion

/**
 * Канвас-биндинг leaf-блока с inline editing (Title/Text/Svg):
 * boundProps + componentId — id нужен редактору для двойного клика.
 *
 * @param ctx - Контекст биндинга канваса.
 * @returns Пропсы для канвасного компонента блока.
 */
export function bindBoundPropsWithComponentId(ctx: IBlockCanvasContext): Record<string, unknown> {
    return { componentId: ctx.component.id, ...ctx.boundProps };
}
