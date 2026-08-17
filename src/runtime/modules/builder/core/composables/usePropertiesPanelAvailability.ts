// #region Imports
// Vue
import { watch, type Ref } from 'vue';

// Pinia
import { useSidebarStore } from '../stores/sidebar';
// #endregion

/**
 * Держит сайдбар-стор в курсе того, монтируется ли правая панель свойств.
 *
 * Панель рендерится только с правом правки, а её ширину вычитают из канваса три
 * места (ширина контейнера, смещение тулбара, перецентровка). Выбор блока при
 * этом разрешён любой роли — это подсветка, а не правка, — поэтому без флага
 * клик наблюдателя резервировал бы место под панель, которой нет.
 *
 * Наблюдение, а не разовый вызов: в сборках без SSR роль приезжает запросом уже
 * после первого кадра, то есть право могут отобрать у открытой панели.
 *
 * @param canEdit - Право правки текущей роли.
 */
export function usePropertiesPanelAvailability(canEdit: Ref<boolean>): void {
    const sidebarStore = useSidebarStore();

    watch(
        canEdit,
        (isEditable) => {
            sidebarStore.setPropertiesPanelAvailable(isEditable);
        },
        { immediate: true }
    );
}
