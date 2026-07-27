// #region Imports
// Types
import type { Composer } from 'vue-i18n';
import type { TModalKey, IModalOption, ICachedModal } from '../types/modals';

// Nuxt
import { useNuxtApp } from '#imports';

// Composables
import { useApiClient } from '../../../common/composables/useApiClient';
// #endregion

// #region Data
/**
 * Глобальный кеш модальных окон
 */
let modalsCache: ICachedModal[] = [];
let isCacheLoaded = false;
// #endregion

/**
 * Загрузить список модальных окон из манифеста brick-компонентов
 * Результат кешируется для последующих вызовов
 */
export async function loadModals(): Promise<void> {
    if (isCacheLoaded) {
        return;
    }

    try {
        const { apiFetcher } = useApiClient();
        const response = await apiFetcher<{
            bricks: Array<{ name: string; category: string; brickPath: string }>;
        }>('/api/bricks/components');
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
 * Найти модалку в кеше по имени
 * @param modalName - Имя модального компонента
 * @returns Запись кеша или undefined
 */
export function getCachedModal(modalName: TModalKey): ICachedModal | undefined {
    return modalsCache.find((modal) => modal.name === modalName);
}

/**
 * Проверить, загружен ли кеш модалок
 */
export function isModalsCacheLoaded(): boolean {
    return isCacheLoaded;
}
