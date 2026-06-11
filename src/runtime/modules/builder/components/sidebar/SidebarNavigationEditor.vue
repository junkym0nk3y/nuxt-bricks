<script setup lang="ts">
// #region Imports
// Vue
import { computed } from 'vue';

// Pinia
import { useNavigationStore } from '../../stores/navigation';
import { useComponentsStore } from '../../stores/components';

// Components
import BricksInput from '../../../ui/inputs/BricksInput.vue';
import BricksButton from '../../../ui/base/button/BricksButton.vue';
// #endregion

// #region Data
const navigationStore = useNavigationStore();
const componentsStore = useComponentsStore();
// #endregion

// #region Computed
const items = computed(() => navigationStore.items);
// #endregion

// #region Methods
/**
 * Добавляет новый пустой навигационный пункт.
 */
function handleAddItem(): void {
    navigationStore.addItem('', '');
    componentsStore.saveToHistory();
}

/**
 * Удаляет навигационный пункт.
 *
 * @param id - Идентификатор пункта.
 */
function handleRemoveItem(id: string): void {
    navigationStore.removeItem(id);
    componentsStore.saveToHistory();
}

/**
 * Обновляет target навигационного пункта.
 *
 * @param id - Идентификатор пункта.
 * @param value - Новое значение target.
 */
function handleUpdateTarget(id: string, value: string): void {
    navigationStore.updateItem(id, { target: value });
}

/**
 * Обновляет label навигационного пункта.
 *
 * @param id - Идентификатор пункта.
 * @param value - Новое значение label.
 */
function handleUpdateLabel(id: string, value: string): void {
    navigationStore.updateItem(id, { label: value });
}

/**
 * Перемещает пункт вверх.
 *
 * @param index - Текущий индекс пункта.
 */
function handleMoveUp(index: number): void {
    navigationStore.reorderItems(index, index - 1);
    componentsStore.saveToHistory();
}

/**
 * Перемещает пункт вниз.
 *
 * @param index - Текущий индекс пункта.
 */
function handleMoveDown(index: number): void {
    navigationStore.reorderItems(index, index + 1);
    componentsStore.saveToHistory();
}
// #endregion
</script>

<template>
    <div :class="$style.NavigationEditor">
        <label :class="$style.label">
            Навигация
            <span v-if="items.length" :class="$style.count">{{ items.length }}</span>
        </label>

        <div v-if="items.length" :class="$style.list">
            <div v-for="(item, index) in items" :key="item.id" :class="$style.item">
                <div :class="$style.itemInputs">
                    <BricksInput
                        label="Текст"
                        :value="item.label"
                        type="text"
                        placeholder="О нас"
                        @update:value="(val: string) => handleUpdateLabel(item.id, val)"
                    />
                    <BricksInput
                        label="Ссылка"
                        :value="item.target"
                        type="text"
                        placeholder="#section-id"
                        @update:value="(val: string) => handleUpdateTarget(item.id, val)"
                    />
                </div>

                <div :class="$style.itemActions">
                    <button
                        type="button"
                        :class="$style.actionBtn"
                        :disabled="index === 0"
                        title="Переместить вверх"
                        @click="handleMoveUp(index)"
                    >
                        <BricksLandIcon icon="ph:caret-up" />
                    </button>
                    <button
                        type="button"
                        :class="$style.actionBtn"
                        :disabled="index === items.length - 1"
                        title="Переместить вниз"
                        @click="handleMoveDown(index)"
                    >
                        <BricksLandIcon icon="ph:caret-down" />
                    </button>
                    <button
                        type="button"
                        :class="[$style.actionBtn, $style.actionBtnDanger]"
                        title="Удалить"
                        @click="handleRemoveItem(item.id)"
                    >
                        <BricksLandIcon icon="ph:trash" />
                    </button>
                </div>
            </div>
        </div>

        <BricksButton size="md" variant="secondary" @click="handleAddItem">
            <BricksLandIcon icon="ph:plus" />
            Добавить пункт
        </BricksButton>
    </div>
</template>

<style module lang="scss">
.NavigationEditor {
    display: flex;
    flex-direction: column;
    gap: 1.2rem;
}

.label {
    display: flex;
    align-items: center;
    gap: 0.8rem;
    font-size: 1.4rem;
    font-weight: 500;
    color: var(--land-base-600);
}

.count {
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 2rem;
    height: 2rem;
    padding: 0 0.6rem;
    border-radius: 1rem;
    background-color: var(--land-base-100);
    font-size: 1.2rem;
    font-weight: 600;
    color: var(--land-base-500);
}

.list {
    display: flex;
    flex-direction: column;
    gap: 1.2rem;
}

.item {
    display: flex;
    gap: 0.8rem;
    padding: 1.2rem;
    border-radius: var(--border-radius-sm);
    border: 1px solid var(--land-base-200);
    background-color: var(--land-base-50);
}

.itemInputs {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 0.8rem;
    min-width: 0;
}

.itemActions {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    flex-shrink: 0;
}

.actionBtn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 2.8rem;
    height: 2.8rem;
    padding: 0;
    border-radius: var(--border-radius-sm);
    border: none;
    background: transparent;
    font-size: 1.4rem;
    color: var(--land-base-500);
    transition:
        background-color var(--default-transition),
        color var(--default-transition);
    cursor: pointer;

    &:hover:not(:disabled) {
        background-color: var(--land-base-100);
        color: var(--land-base-700);
    }

    &:disabled {
        opacity: 0.3;
        cursor: not-allowed;
    }
}

.actionBtnDanger {
    &:hover:not(:disabled) {
        background-color: rgb(239 68 68 / 10%);
        color: var(--land-danger-500);
    }
}
</style>
