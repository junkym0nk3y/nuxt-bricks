/**
 * Sidebar component types
 */

import type { ComponentLibraryItem } from '../../types/landing';

export interface IComponentCardProps {
    component: ComponentLibraryItem;
    isLayout?: boolean;
}

export interface IDragComposable {
    startDrag: (component: ComponentLibraryItem, event: DragEvent) => void;
}
