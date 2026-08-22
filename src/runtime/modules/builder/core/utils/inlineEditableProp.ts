// #region Imports
import type { IBrickValues } from '../../../common/types/index';
import type {
    IInlineEditableProp,
    TInlineEditingPropType,
} from '../../../common/types/inlineEditing';
import type { ILayoutProperty } from '../../../common/types/layoutProperty';

// Utils
import { readOwnKey } from '../../../common/utils/safeRecord';
// #endregion

// The type travels with the helpers so that `useCanvasItemInlineEditing` takes both
// from one place
export type { IInlineEditableProp } from '../../../common/types/inlineEditing';

/** Inline-editable types of a layout block: no `input`, or Media's CSS props get caught */
const INLINE_EDITABLE_LAYOUT_TYPES = new Set<string>(['inline-content', 'textarea']);

/** Inline-editable types of a brick component, `input` included for headlines */
const INLINE_EDITABLE_BRICK_TYPES = new Set<string>(['inline-content', 'textarea', 'input']);

/**
 * Finds every inline-editable property among the layout properties.
 *
 * @param layoutProperties - Properties of a layout component.
 * @returns The editable properties.
 */
export function findAllInlineEditableLayoutProps(
    layoutProperties: ILayoutProperty[]
): IInlineEditableProp[] {
    const result: IInlineEditableProp[] = [];

    for (const prop of layoutProperties) {
        if (INLINE_EDITABLE_LAYOUT_TYPES.has(prop.type)) {
            result.push({
                propName: prop.name,
                propType: prop.type as TInlineEditingPropType,
                label: prop.label,
            });
        }
    }

    return result;
}

/**
 * Upper-cases the first letter of a string.
 */
function capitalize(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Whether the showWhen condition of a property holds.
 *
 * The field name is declared by the brick file while the props come from the schema:
 * a `showWhen.field` such as `toString`, read without the own-key check, would return
 * a method of the prototype, and the comparison with `equals` would be false for any
 * schema — the property would silently drop out of inline editing.
 *
 * @param propConfig - Property configuration taken from the brick.
 * @param componentProps - Current props of the component.
 * @returns True when the condition holds or there is none.
 */
function isShowWhenSatisfied(
    propConfig: IBrickValues,
    componentProps: Record<string, unknown>
): boolean {
    if (!propConfig.showWhen) {
        return true;
    }

    return readOwnKey(componentProps, propConfig.showWhen.field) === propConfig.showWhen.equals;
}

/**
 * Finds every inline-editable property among the brick values.
 * The showWhen conditions are honored, so inactive properties are filtered out.
 *
 * @param brickValues - The `values` object of a `.brick.ts` file.
 * @param componentProps - Current props of the component, for checking showWhen.
 * @returns The editable properties.
 */
export function findAllInlineEditableBrickProps(
    brickValues: Record<string, IBrickValues>,
    componentProps: Record<string, unknown> = {}
): IInlineEditableProp[] {
    const result: IInlineEditableProp[] = [];

    for (const [propName, propConfig] of Object.entries(brickValues)) {
        if (!INLINE_EDITABLE_BRICK_TYPES.has(propConfig.type)) {
            continue;
        }

        if (!isShowWhenSatisfied(propConfig, componentProps)) {
            continue;
        }

        // `input` maps onto `textarea`: TipTap handles plain text just as well
        const propType: TInlineEditingPropType =
            propConfig.type === 'input' ? 'textarea' : (propConfig.type as TInlineEditingPropType);

        result.push({
            propName,
            propType,
            label: propConfig.desc || capitalize(propName),
        });
    }

    return result;
}
