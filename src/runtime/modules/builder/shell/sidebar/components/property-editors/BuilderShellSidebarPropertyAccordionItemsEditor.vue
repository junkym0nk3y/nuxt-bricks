<script setup lang="ts">
// #region Imports
// Types
import type { IAccordionItem } from '../../../../../layouts-blocks/types/blockProps';

// Vue
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

// Components
import BricksButton from '../../../../../ui/base/button/BricksButton.vue';
import TextEditorArea from '../../../../../text-editor/components/TextEditorArea.vue';
// #endregion

// #region Interfaces
interface IPropertyAccordionItemsEditorProps {
    modelValue?: IAccordionItem[];
    label?: string;
}

interface IPropertyAccordionItemsEditorEmits {
    'update:modelValue': [value: IAccordionItem[]];
}
// #endregion

// #region Props
const props = withDefaults(defineProps<IPropertyAccordionItemsEditorProps>(), {
    modelValue: () => [],
    label: '',
});
// #endregion

// #region Emits
const emit = defineEmits<IPropertyAccordionItemsEditorEmits>();
// #endregion

// #region Data
const { t } = useI18n();
// #endregion

// #region Computed
const items = computed<IAccordionItem[]>(() => props.modelValue || []);
const hasItems = computed<boolean>(() => items.value.length > 0);
const displayLabel = computed<string>(() => props.label || t('bricks.properties.accordion.label'));
// #endregion

// #region Methods
/**
 * Clones the array of accordion items.
 */
function cloneItems(source: IAccordionItem[]): IAccordionItem[] {
    return source.map((item) => ({ ...item }));
}

/**
 * Emits the updated array of items.
 */
function updateItems(value: IAccordionItem[]): void {
    emit('update:modelValue', value);
}

/**
 * Adds a new item to the end of the list, copying the data of the last one when the
 * list is not empty.
 */
function handleAddItem(): void {
    const lastItem = items.value[items.value.length - 1];
    const newItem: IAccordionItem = lastItem
        ? { ...lastItem, title: `${lastItem.title} ${t('bricks.properties.accordion.copySuffix')}` }
        : {
              title: t('bricks.properties.accordion.defaultTitle', { n: items.value.length + 1 }),
              // HTML is banned in the dictionaries (unplugin-vue-i18n), so the
              // wrapper is added here
              content: `<p>${t('bricks.properties.accordion.defaultContent')}</p>`,
          };

    updateItems([...items.value, newItem]);
}

/**
 * Removes the item at the index.
 *
 * @param index - Index of the item to remove.
 */
function handleRemoveItem(index: number): void {
    const next = cloneItems(items.value);
    next.splice(index, 1);
    updateItems(next);
}

/**
 * Updates the title field of an item.
 *
 * @param index - Index of the item.
 * @param value - New title value.
 */
function handleTitleChange(index: number, value: string): void {
    const next = cloneItems(items.value);
    if (!next[index]) {
        return;
    }
    next[index] = { ...next[index], title: value };
    updateItems(next);
}

/**
 * Updates the content field of an item.
 *
 * @param index - Index of the item.
 * @param value - New content value (HTML).
 */
function handleContentChange(index: number, value: string): void {
    const next = cloneItems(items.value);
    if (!next[index]) {
        return;
    }
    next[index] = { ...next[index], content: value };
    updateItems(next);
}

/**
 * Moves the item one position up.
 *
 * @param index - Index of the item.
 */
function handleMoveUp(index: number): void {
    if (index === 0) {
        return;
    }
    const next = cloneItems(items.value);
    const [item] = next.splice(index, 1);
    next.splice(index - 1, 0, item);
    updateItems(next);
}

/**
 * Moves the item one position down.
 *
 * @param index - Index of the item.
 */
function handleMoveDown(index: number): void {
    if (index >= items.value.length - 1) {
        return;
    }
    const next = cloneItems(items.value);
    const [item] = next.splice(index, 1);
    next.splice(index + 1, 0, item);
    updateItems(next);
}
// #endregion
</script>

<template>
    <div :class="$style.BuilderShellSidebarPropertyAccordionItemsEditor">
        <div :class="$style.header">
            <span :class="$style.label">{{ displayLabel }}</span>
            <BricksButton size="sm" variant="primary" @click="handleAddItem">
                <BricksIcon icon="ta:outline-plus" />
                {{ t('bricks.properties.add') }}
            </BricksButton>
        </div>

        <div v-if="hasItems" :class="$style.list">
            <template v-for="(item, index) in items" :key="index">
                <div :class="$style.card">
                    <div :class="$style.cardBody">
                        <div :class="$style.fieldGroup">
                            <span :class="$style.fieldLabel"
                                >{{ t('bricks.properties.accordion.itemTitle') }}:
                                {{ index + 1 }}</span
                            >
                            <TextEditorArea
                                :value="item.title"
                                :placeholder="t('bricks.properties.accordion.titlePlaceholder')"
                                :min-height="60"
                                @update:value="handleTitleChange(index, $event)"
                            />
                        </div>

                        <div :class="$style.fieldGroup">
                            <span :class="$style.fieldLabel"
                                >{{ t('bricks.properties.accordion.itemContent') }}:
                                {{ index + 1 }}</span
                            >
                            <TextEditorArea
                                :value="item.content"
                                :placeholder="t('bricks.properties.accordion.contentPlaceholder')"
                                :min-height="100"
                                @update:value="handleContentChange(index, $event)"
                            />
                        </div>

                        <div :class="$style.actions">
                            <BricksButton
                                size="sm"
                                variant="ghost"
                                :disabled="index === 0"
                                @click="handleMoveUp(index)"
                            >
                                <BricksIcon icon="ta:outline-arrow-up" />
                            </BricksButton>
                            <BricksButton
                                size="sm"
                                variant="ghost"
                                :disabled="index === items.length - 1"
                                @click="handleMoveDown(index)"
                            >
                                <BricksIcon icon="ta:outline-arrow-down" />
                            </BricksButton>
                            <BricksButton
                                size="sm"
                                variant="ghost"
                                @click="handleRemoveItem(index)"
                            >
                                <BricksIcon icon="ta:outline-trash" />
                            </BricksButton>
                        </div>
                    </div>
                </div>
                <span v-show="index === items.length - 1" :class="$style.cardSep"> </span>
            </template>
        </div>

        <button v-else type="button" :class="$style.empty" @click="handleAddItem">
            <BricksIcon :class="$style.emptyIcon" icon="ta:outline-playlist-add" />
            <span>{{ t('bricks.properties.accordion.empty') }}</span>
        </button>
    </div>
</template>

<style module lang="scss">
.BuilderShellSidebarPropertyAccordionItemsEditor {
    display: flex;
    flex-direction: column;
    gap: 1.2rem;
}

.header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
}

.label {
    font-size: 1.4rem;
    font-weight: 600;
    color: var(--bricks-base-800);
}

.list {
    display: flex;
    flex-direction: column;
    gap: 1.8rem;
}

.card {
    display: flex;
    padding: 1.2rem;
    border-radius: var(--bricks-border-radius-xs);
    border: 1px solid var(--bricks-base-200);
    background: var(--bricks-base-0);
    gap: 1rem;
}

.cardBody {
    display: flex;
    flex-direction: column;
    flex: 1;
    gap: 0.8rem;
    min-width: 0;
}

.cardSep {
    top: 0;
    left: 0;
    width: 100%;
    height: 1px;
    background: var(--bricks-base-200);
}

.fieldGroup {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
}

.fieldLabel {
    font-size: 1.2rem;
    font-weight: 500;
    color: var(--bricks-base-500);
    user-select: none;
}

.actions {
    display: flex;
    gap: 0.4rem;
}

.empty {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 2.4rem;
    border-radius: var(--bricks-border-radius-xs);
    border: 0.2rem dashed var(--bricks-base-300);
    background: var(--bricks-base-50);
    font-size: 1.4rem;
    color: var(--bricks-base-500);
    transition:
        border-color 150ms ease,
        background 150ms ease,
        color 150ms ease;
    cursor: pointer;
    flex-direction: column;
    gap: 0.8rem;

    &:hover {
        border-color: var(--bricks-primary-400);
        background: var(--bricks-primary-50);
        color: var(--bricks-primary-600);
    }
}

.emptyIcon {
    font-size: 3.2rem;
}
</style>
