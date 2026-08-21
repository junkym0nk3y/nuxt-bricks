/**
 * Types of the property configuration of layout components.
 * The contract of the properties panel: used by the builder core, by the canvas and by
 * the sidebar; it has to live in common because layouts-blocks must not import
 * builder.
 */

import type { IInlineContentSegment } from './content';
import type { IPropertyDefinition } from './brick';

/**
 * Editor types available to layout blocks. Narrower than the set of brick properties
 * (`TPropertyType`) deliberately: `object`, `readonly` and `switch` do not occur in
 * block definitions, and allowing them would mean promising behavior the panel does
 * not provide for layout blocks.
 */
export type TLayoutPropertyType =
    | 'number'
    | 'string'
    | 'select'
    | 'boolean'
    | 'textarea'
    | 'input'
    | 'image'
    | 'video'
    | 'inline-content'
    | 'array'
    | 'accordion-items'
    | 'tags'
    | 'image-gallery'
    | 'color';

/**
 * A panel property of a layout block.
 *
 * Derived from `IPropertyDefinition` rather than declared anew: the object reaches the
 * panel structurally (`layoutProperties.ts` is a pass-through, there is no mapper
 * between the types), so two independent copies would have to match field by field. As
 * long as they were copies, they did diverge — the panel drew `tags` and
 * `image-gallery` while declaring them in a definition was impossible.
 *
 * Only the three fields whose set really is narrower for layout blocks differ: the
 * editor type, the shape of the default and the shape of the options.
 */
export interface ILayoutProperty extends Omit<IPropertyDefinition, 'type' | 'default' | 'options'> {
    type: TLayoutPropertyType;
    default: string | number | boolean | IInlineContentSegment[] | Record<string, unknown>[];
    options?: Array<{ label: string; value: string | number }>;
}
