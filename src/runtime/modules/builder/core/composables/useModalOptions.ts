// #region Imports
// Types
import type { Composer } from 'vue-i18n';
import type { TModalKey, IModalOption, TCachedModal } from '../types/modals';

// Nuxt
import { useNuxtApp } from '#imports';
// #endregion

// #region Data
/**
 * Кеш модалок из манифеста brick-компонентов. Заполняется тем же ответом ручки
 * компонентов, из которого собирается библиотека (`useComponentLibrary`):
 * второй запрос того же манифеста означал бы два независимых кеша одного ответа,
 * а его отказ — селектор модалок, пустой до перезагрузки страницы.
 */
let modalsCache: TCachedModal[] = [];
// #endregion

/**
 * Заменяет кеш модалок. Зовётся только после успешной загрузки манифеста:
 * неудачное обновление оставляет прежний список, иначе отказ сети опустошал бы
 * уже работающий селектор.
 *
 * @param entries - Записи модалок из манифеста.
 */
export function replaceModalsCache(entries: TCachedModal[]): void {
    modalsCache = entries;
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
