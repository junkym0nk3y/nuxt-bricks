// #region Imports
// Types
import type {
    INavigationItem,
    INavigationMeta,
    IBricksSchemaMeta,
} from '../../../common/types/brick';

// Utils
import sha256 from 'tiny-sha256';

// Vue
import { ref, computed } from 'vue';

// Pinia
import { defineStore } from 'pinia';
// #endregion

/**
 * Генерирует уникальный идентификатор на основе sha256(timestamp + random).
 */
function generateId(): string {
    return sha256(`${Date.now()}-${Math.random()}`).slice(0, 12);
}

/**
 * Управляет навигационными пунктами лендинга.
 * Данные хранятся в schema.meta.navigation и доступны кастомным компонентам на сайте.
 */
export const useNavigationStore = defineStore('bricksNavigation', () => {
    // #region State
    const items = ref<INavigationItem[]>([]);
    // #endregion

    // #region Getters
    /**
     * Есть ли хотя бы один навигационный пункт.
     */
    const hasItems = computed<boolean>(() => items.value.length > 0);

    /**
     * Сериализованные данные навигации для schema.meta.
     */
    const navigationMeta = computed<INavigationMeta>(() => ({
        items: items.value,
    }));
    // #endregion

    // #region Actions
    /**
     * Загружает навигацию из schema.meta.
     *
     * @param meta - Объект meta из IBricksSchema.
     */
    function loadFromMeta(meta?: IBricksSchemaMeta): void {
        const navItems = meta?.navigation?.items;
        items.value = Array.isArray(navItems) ? navItems.map((item) => ({ ...item })) : [];
    }

    /**
     * Добавляет новый навигационный пункт.
     *
     * @param target - Якорь (#section-id) или URL.
     * @param label - Отображаемый текст.
     */
    function addItem(target: string, label: string): void {
        items.value = [
            ...items.value,
            {
                id: generateId(), // по идеи можно поменять на useId
                target,
                label,
            },
        ];
    }

    /**
     * Удаляет навигационный пункт по id.
     *
     * @param id - Идентификатор пункта.
     */
    function removeItem(id: string): void {
        items.value = items.value.filter((item) => item.id !== id);
    }

    /**
     * Обновляет поля навигационного пункта.
     *
     * @param id - Идентификатор пункта.
     * @param updates - Частичные обновления (target и/или label).
     */
    function updateItem(
        id: string,
        updates: Partial<Pick<INavigationItem, 'target' | 'label'>>
    ): void {
        items.value = items.value.map((item) => (item.id === id ? { ...item, ...updates } : item));
    }

    /**
     * Перемещает пункт с одной позиции на другую.
     *
     * @param fromIndex - Исходная позиция.
     * @param toIndex - Целевая позиция.
     */
    function reorderItems(fromIndex: number, toIndex: number): void {
        if (
            fromIndex < 0 ||
            toIndex < 0 ||
            fromIndex >= items.value.length ||
            toIndex >= items.value.length ||
            fromIndex === toIndex
        ) {
            return;
        }

        const updated = [...items.value];
        const [moved] = updated.splice(fromIndex, 1);
        updated.splice(toIndex, 0, moved);
        items.value = updated;
    }

    /**
     * Сбрасывает все навигационные пункты.
     */
    function reset(): void {
        items.value = [];
    }

    /**
     * Возвращает данные навигации для записи в schema.meta.
     */
    function toMeta(): INavigationMeta {
        return {
            items: items.value.map((item) => ({ ...item })),
        };
    }
    // #endregion

    return {
        items,
        hasItems,
        navigationMeta,
        loadFromMeta,
        addItem,
        removeItem,
        updateItem,
        reorderItems,
        reset,
        toMeta,
    };
});
