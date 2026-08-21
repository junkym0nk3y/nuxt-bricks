/**
 * Contract of inline editing — breaks the cyclic type import
 * builder/core/utils/inlineEditableProp ↔ editor/stores/inlineEditing.
 */
import type { TBrickPropValue } from './brick';

/**
 * Type of an editable property for inline editing.
 */
export type TInlineEditingPropType = 'inline-content' | 'textarea';

export interface IInlineEditableProp {
    propName: string;
    propType: TInlineEditingPropType;
    label: string;
}

/**
 * The port of the text editor into the builder state (reading and writing props +
 * history). Provided by the canvas through INLINE_EDITOR_HOST_KEY — the text editor
 * does not import builder/core (otherwise the graph of the builder stores leaks into
 * the published bundle through BlockText).
 */
export interface IInlineEditorHost {
    getPropValue(componentId: string, propName: string): unknown;
    updateProp(componentId: string, propName: string, value: TBrickPropValue): void;
    commitHistory(): void;
}
