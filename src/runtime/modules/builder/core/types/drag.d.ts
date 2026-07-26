import type { IBricksComponent, IDragVisualSize } from '../../../common/types/brick';

export type TDragGhostVariant = 'canvas' | 'library';

/** Запись потока вставки: либо блок канваса, либо место будущей вставки. */
export type TDropFlowEntry =
    | { kind: 'item'; key: string; component: IBricksComponent }
    | { kind: 'placeholder'; key: string };

export interface IDragGhostOptions {
    event: DragEvent;
    sourceElement: HTMLElement;
    variant: TDragGhostVariant;
    placeholderSize: IDragVisualSize;
}
