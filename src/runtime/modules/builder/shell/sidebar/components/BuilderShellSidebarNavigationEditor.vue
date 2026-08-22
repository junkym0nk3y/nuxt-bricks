<script setup lang="ts">
/**
 * @description Editor of the page navigation items inside the publish settings: the
 * caption and the anchor of every item, their order and their removal.
 *
 * The tooltips of the row buttons open to the left: the column of buttons is pressed
 * against the right edge of the sidebar, and a tooltip below would cover the next
 * button of that same column.
 */

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
import BricksIconButton from '../../../../ui/base/icon-button/BricksIconButton.vue';
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
 * Adds a new empty navigation item.
 */
function handleAddItem(): void {
    navigationStore.addItem('', '');
    componentsStore.saveToHistory();
}

/**
 * Removes a navigation item.
 *
 * @param id - Identifier of the item.
 */
function handleRemoveItem(id: string): void {
    navigationStore.removeItem(id);
    componentsStore.saveToHistory();
}

/**
 * Updates the target of a navigation item.
 *
 * @param id - Identifier of the item.
 * @param value - New target value.
 */
function handleUpdateTarget(id: string, value: string): void {
    navigationStore.updateItem(id, { target: value });
}

/**
 * Updates the label of a navigation item.
 *
 * @param id - Identifier of the item.
 * @param value - New label value.
 */
function handleUpdateLabel(id: string, value: string): void {
    navigationStore.updateItem(id, { label: value });
}

/**
 * Moves an item up.
 *
 * @param index - Current index of the item.
 */
function handleMoveUp(index: number): void {
    navigationStore.reorderItems(index, index - 1);
    componentsStore.saveToHistory();
}

/**
 * Moves an item down.
 *
 * @param index - Current index of the item.
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
                    <BricksIconButton
                        variant="ghost"
                        icon="ta:outline-chevron-up"
                        :label="t('bricks.publish.navigation.moveUp')"
                        :disabled="index === 0"
                        tooltip-side="left"
                        @click="handleMoveUp(index)"
                    />
                    <BricksIconButton
                        variant="ghost"
                        icon="ta:outline-chevron-down"
                        :label="t('bricks.publish.navigation.moveDown')"
                        :disabled="index === items.length - 1"
                        tooltip-side="left"
                        @click="handleMoveDown(index)"
                    />
                    <BricksIconButton
                        variant="ghost"
                        icon="ta:outline-trash"
                        :label="t('bricks.common.delete')"
                        danger
                        tooltip-side="left"
                        @click="handleRemoveItem(item.id)"
                    />
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
</style>
