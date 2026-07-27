// #region Imports
// Types
import type { Component } from 'vue';
import type { TModalKey } from '../../core/types/modals';

// Composables
import {
    loadModals,
    getModalOptions,
    getCachedModal,
    isModalsCacheLoaded,
} from '../../core/composables/useModalOptions';
import { useBrickImports } from '../../../common/composables/useBrickImports';
// #endregion

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
    const modalBrick = getCachedModal(modalName);

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
    if (!isModalsCacheLoaded()) {
        await loadModals();
    }

    return getModalComponent(modalName);
}

/**
 * Composable для работы с модальными окнами
 * Загружает список модалок из манифеста brick-компонентов и кеширует
 */
export function useModals() {
    return {
        loadModals,
        getModalOptions,
        getModalComponent,
        getModalComponentLazy,
        isCacheLoaded: isModalsCacheLoaded,
    };
}
