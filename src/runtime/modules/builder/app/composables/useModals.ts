// #region Imports
// Types
import type { Component } from 'vue';
import type { Composer } from 'vue-i18n';
import type { TModalKey, IModalOption } from '../types/modals';

// Nuxt
import { useNuxtApp } from '#imports';

// Composables
import { useApiClient } from '../../../common/composables/useApiClient';
import { useBrickImports } from '../../../common/composables/useBrickImports';
// #endregion

// #region Data
/**
 * Глобальный кеш модальных окон
 */
let modalsCache: Array<{ name: string; brickPath: string }> = [];
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
            bricks: Array<{ name: string; category: string; brickPath: string }>;
        }>('/mock-api/bricks-components');
        const bricks = response?.bricks || [];

        // Фильтруем только модалки
        modalsCache = bricks
            .filter((brick) => brick.category === 'Modal')
            .map((brick) => ({
                name: brick.name,
                brickPath: brick.brickPath,
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
    // Вне setup-контекста: $i18n резолвится лениво через useNuxtApp
    const i18n = useNuxtApp().$i18n as Composer | undefined;

    return [
        { label: i18n?.t('bricks.properties.modalDisabled') ?? 'Отключено', value: null },
        ...modalsCache.map((modal) => ({
            label: modal.name,
            value: modal.name as TModalKey,
        })),
    ];
}

/**
 * Получить компонент модалки по имени (синхронная версия)
 * Использует существующую систему useBrickImports для загрузки компонента
 * @param modalName - Имя модального компонента (например 'CallbackFormModal')
 * @returns Функция динамического импорта компонента или null
 */
function getModalComponent(modalName: TModalKey | null): (() => Promise<Component>) | null {
    if (!modalName) {
        return null;
    }

    // Ищем модалку по имени в кеше
    const modalBrick = modalsCache.find((modal) => modal.name === modalName);

    if (!modalBrick) {
        console.error(`[getModalComponent] Modal not found: ${modalName}`);
        return null;
    }

    // Используем существующую систему импортов
    const { findImportModule } = useBrickImports();
    const moduleLoader = findImportModule(modalBrick.brickPath);

    if (!moduleLoader) {
        console.error(`[getModalComponent] No loader found for: ${modalBrick.brickPath}`);
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
