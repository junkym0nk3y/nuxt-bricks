import type { IComponentsFavoritesActions, IComponentsStore } from '../types';

const STORAGE_KEY = 'bricks-favorite-components';

/**
 * Loads the names of the favorite components out of localStorage.
 */
export function loadFavoritesFromStorage(): string[] {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) {
            return [];
        }
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

/**
 * Stores the names of the favorite components in localStorage.
 */
function saveFavoritesToStorage(favorites: string[]): void {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(favorites));
    } catch {
        // A failed write to localStorage is ignored
    }
}

/**
 * Actions that manage the favorite components.
 */
export const favoritesActions: IComponentsFavoritesActions = {
    /**
     * Adds a component to the favorites or takes it out, by name.
     *
     * @param componentName - Name of the component.
     */
    toggleFavorite(this: IComponentsStore, componentName: string) {
        const index = this.favorites.indexOf(componentName);
        if (index === -1) {
            this.favorites.push(componentName);
        } else {
            this.favorites.splice(index, 1);
        }
        saveFavoritesToStorage([...this.favorites]);
    },
};
