/**
 * Sidebar component types
 */

import type { ComponentLibraryItem } from '../../../../common/types/brick';

export interface ISidebarComponentCardProps {
    component: ComponentLibraryItem;
    isLayout?: boolean;
}

export interface IDragComposable {
    startDrag: (component: ComponentLibraryItem, event: DragEvent) => void;
}
