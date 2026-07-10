<script setup lang="ts">
// #region Imports
// Vue
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

// Pinia
import { useNavigationStore } from '../../../core/stores/navigation';
import { useComponentsStore } from '../../../core/stores/components';

// Components
import BricksInput from '../../../../ui/inputs/BricksInput.vue';
import BricksButton from '../../../../ui/base/button/BricksButton.vue';
// #endregion

// #region Data
const { t } = useI18n();
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
    <div :class="$style.BuilderShellSidebarNavigationEditor">
        <label :class="$style.label">
            {{ t('bricks.publish.navigation.title') }}
            <span v-if="items.length" :class="$style.count">{{ items.length }}</span>
        </label>

        <div v-if="items.length" :class="$style.list">
            <div v-for="(item, index) in items" :key="item.id" :class="$style.item">
                <div :class="$style.itemInputs">
                    <BricksInput
                        :label="t('bricks.publish.navigation.text')"
                        :value="item.label"
                        type="text"
                        :placeholder="t('bricks.publish.navigation.textPlaceholder')"
                        @update:value="(val: string) => handleUpdateLabel(item.id, val)"
                    />
                    <BricksInput
                        :label="t('bricks.publish.navigation.link')"
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
                        :title="t('bricks.publish.navigation.moveUp')"
                        @click="handleMoveUp(index)"
                    >
                        <BricksIcon icon="ta:outline-chevron-up" />
                    </button>
                    <button
                        type="button"
                        :class="$style.actionBtn"
                        :disabled="index === items.length - 1"
                        :title="t('bricks.publish.navigation.moveDown')"
                        @click="handleMoveDown(index)"
                    >
                        <BricksIcon icon="ta:outline-chevron-down" />
                    </button>
                    <button
                        type="button"
                        :class="[$style.actionBtn, $style.actionBtnDanger]"
                        :title="t('bricks.common.delete')"
                        @click="handleRemoveItem(item.id)"
                    >
                        <BricksIcon icon="ta:outline-trash" />
                    </button>
                </div>
            </div>
        </div>

        <BricksButton size="md" variant="secondary" @click="handleAddItem">
            <BricksIcon icon="ta:outline-plus" />
            {{ t('bricks.publish.navigation.addItem') }}
        </BricksButton>
    </div>
</template>

<style module lang="scss">
.BuilderShellSidebarNavigationEditor {
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
    color: var(--bricks-base-600);
}

.count {
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 2rem;
    height: 2rem;
    padding: 0 0.6rem;
    border-radius: 1rem;
    background-color: var(--bricks-base-100);
    font-size: 1.2rem;
    font-weight: 600;
    color: var(--bricks-base-500);
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
    border-radius: var(--bricks-border-radius-sm);
    border: 1px solid var(--bricks-base-200);
    background-color: var(--bricks-base-50);
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
    border-radius: var(--bricks-border-radius-sm);
    border: none;
    background: transparent;
    font-size: 1.4rem;
    color: var(--bricks-base-500);
    transition:
        background-color var(--bricks-default-transition),
        color var(--bricks-default-transition);
    cursor: pointer;

    &:hover:not(:disabled) {
        background-color: var(--bricks-base-100);
        color: var(--bricks-base-700);
    }

    &:disabled {
        opacity: 0.3;
        cursor: not-allowed;
    }
}

.actionBtnDanger {
    &:hover:not(:disabled) {
        background-color: rgb(239 68 68 / 10%);
        color: var(--bricks-danger-500);
    }
}
</style>
