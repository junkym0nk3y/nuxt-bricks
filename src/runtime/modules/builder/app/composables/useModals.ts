// #region Imports
// Types
import type { Component } from 'vue';
import type { TModalKey, IModalOption } from '../types/modals';

// Composables
import { useApiClient } from '../../../common/composables/useApiClient';
import { useStoryImports } from '../../../common/composables/useStoryImports';
// #endregion

// #region Data
/**
 * Глобальный кеш модальных окон
 */
let modalsCache: Array<{ name: string; storyPath: string }> = [];
let isCacheLoaded = false;
// #endregion

/**
 * Загрузить список модальных окон из bricks.json
 * Результат кешируется для последующих вызовов
 */
async function loadModals(): Promise<void> {
    if (isCacheLoaded) {
        return;
    }

    try {
        const { apiFetcher } = useApiClient();
        const response = await apiFetcher<{
            stories: Array<{ name: string; category: string; storyPath: string }>;
        }>('/mock-api/bricks-components');
        const stories = response?.stories || [];

        // Фильтруем только модалки
        modalsCache = stories
            .filter((story) => story.category === 'Modal')
            .map((story) => ({
                name: story.name,
                storyPath: story.storyPath,
            }));

        isCacheLoaded = true;
    } catch (error) {
        console.error('[loadModals] Failed to load modals:', error);
        modalsCache = [];
        isCacheLoaded = true;
    }
}

/**
 * Получить список опций модалок для селектора
 * Синхронная функция, использует предзагруженный кеш
 * @returns Массив опций с label и value
 */
export function getModalOptions(): IModalOption[] {
    return [
        { label: 'Отключено', value: null },
        ...modalsCache.map((modal) => ({
            label: modal.name,
            value: modal.name as TModalKey,
        })),
    ];
}

/**
 * Получить компонент модалки по имени (синхронная версия)
 * Использует существующую систему useStoryImports для загрузки компонента
 * @param modalName - Имя модального компонента (например 'CallbackFormModal')
 * @returns Функция динамического импорта компонента или null
 */
function getModalComponent(modalName: TModalKey | null): (() => Promise<Component>) | null {
    if (!modalName) {
        return null;
    }

    // Ищем модалку по имени в кеше
    const modalStory = modalsCache.find((modal) => modal.name === modalName);

    if (!modalStory) {
        console.error(`[getModalComponent] Modal not found: ${modalName}`);
        return null;
    }

    // Используем существующую систему импортов
    const { findImportModule } = useStoryImports();
    const moduleLoader = findImportModule(modalStory.storyPath);

    if (!moduleLoader) {
        console.error(`[getModalComponent] No loader found for: ${modalStory.storyPath}`);
        return null;
    }

    return moduleLoader as () => Promise<Component>;
}

/**
 * Получить компонент модалки по имени с ленивой загрузкой кэша
 * Автоматически загружает кэш модалок, если он ещё не загружен
 * @param modalName - Имя модального компонента (например 'CallbackFormModal')
 * @returns Функция динамического импорта компонента или null
 */
async function getModalComponentLazy(
    modalName: TModalKey | null
): Promise<(() => Promise<Component>) | null> {
    if (!modalName) {
        return null;
    }

    // Ленивая загрузка кэша, если ещё не загружен
    if (!isCacheLoaded) {
        await loadModals();
    }

    return getModalComponent(modalName);
}

/**
 * Composable для работы с модальными окнами
 * Загружает список модалок из bricks.json и кеширует
 */
export function useModals() {
    return {
        loadModals,
        getModalOptions,
        getModalComponent,
        getModalComponentLazy,
        isCacheLoaded: () => isCacheLoaded,
    };
}
