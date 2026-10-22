import type { IBricksComponent, IDragVisualSize } from '../../../common/types/brick';

export type TDragGhostVariant = 'canvas' | 'library';

/** Entry of the drop flow: either a canvas block, or the insertion point of a drop */
export type TDropFlowEntry =
    | { kind: 'item'; key: string; component: IBricksComponent }
    | { kind: 'placeholder'; key: string };

export interface IDragGhostOptions {
    event: DragEvent;
    sourceElement: HTMLElement;
    variant: TDragGhostVariant;
    placeholderSize: IDragVisualSize;
}
