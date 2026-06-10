import type { ILandingComponentsFavoritesActions, ILandingComponentsStore } from '../types';

const STORAGE_KEY = 'landing-favorite-components';

/**
 * Загружает список избранных storyPath из localStorage.
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
 * Сохраняет список избранных storyPath в localStorage.
 */
function saveFavoritesToStorage(favorites: string[]): void {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(favorites));
    } catch {
        // Игнорируем ошибки записи в localStorage
    }
}

/**
 * Набор действий для управления избранными компонентами.
 */
export const favoritesActions: ILandingComponentsFavoritesActions = {
    /**
     * Добавляет или убирает компонент из избранного по имени.
     *
     * @param componentName - Имя компонента.
     */
    toggleFavorite(this: ILandingComponentsStore, componentName: string) {
        const index = this.favorites.indexOf(componentName);
        if (index === -1) {
            this.favorites.push(componentName);
        } else {
            this.favorites.splice(index, 1);
        }
        saveFavoritesToStorage([...this.favorites]);
    },
};
