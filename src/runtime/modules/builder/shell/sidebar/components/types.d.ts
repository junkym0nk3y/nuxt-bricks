/**
 * Sidebar component types
 */

import type { IComponentLibraryItem } from '../../../../common/types/brick';

export interface ISidebarComponentCardProps {
    component: IComponentLibraryItem;
    isLayout?: boolean;
}

export interface IDragComposable {
    startDrag: (component: IComponentLibraryItem, event: DragEvent) => void;
}
