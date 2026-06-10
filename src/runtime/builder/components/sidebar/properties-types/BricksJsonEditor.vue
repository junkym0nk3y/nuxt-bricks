<script setup lang="ts">
// #region Imports
// Vue
import { ref, watch } from 'vue';
// #endregion

// #region Interfaces
interface IJsonEditorProps {
    modelValue?: unknown;
    label?: string;
}

interface IJsonEditorEmits {
    'update:modelValue': [value: unknown];
}
// #endregion

// #region Props
const props = withDefaults(defineProps<IJsonEditorProps>(), {
    modelValue: () => ({}),
    label: 'JSON',
});
// #endregion

// #region Emits
const emit = defineEmits<IJsonEditorEmits>();
// #endregion

// #region Data
const internalValue = ref<unknown>(props.modelValue);
// #endregion

// #region Methods
/**
 * Обновляет значение при изменении в редакторе.
 *
 * @param value - Новое значение из редактора.
 */
function handleUpdate(value: unknown): void {
    internalValue.value = value;
    emit('update:modelValue', value);
}
// #endregion

// #region Watchers
watch(
    () => props.modelValue,
    (newValue) => {
        internalValue.value = newValue;
    }
);
// #endregion
</script>

<template>
    <ClientOnly>
        <div :class="$style.JsonEditor">
            <span v-if="props.label" :class="$style.label">{{ props.label }}</span>
            <div :class="$style.editorWrapper">
                <JsonEditorVue
                    :model-value="internalValue"
                    mode="text"
                    :main-menu-bar="false"
                    :navigation-bar="false"
                    :status-bar="false"
                    :class="$style.editor"
                    @update:model-value="handleUpdate"
                />
            </div>
        </div>

        <template #fallback>
            <div :class="$style.JsonEditor">
                <span v-if="props.label" :class="$style.label">{{ props.label }}</span>
                <div :class="$style.editorWrapper">
                    <div :class="$style.loading">Загрузка редактора...</div>
                </div>
            </div>
        </template>
    </ClientOnly>
</template>

<style module lang="scss">
.JsonEditor {
    /* Фиксируем светлую тему для JSON-редактора */
    --land-base-0: #fff;
    --land-base-50: #f9fafb;
    --land-base-100: #f3f4f6;
    --land-base-300: #d1d5db;
    --land-base-500: #6b7280;
    --land-base-900: #111827;
    --land-primary-100: #dbeafe;
    --land-primary-500: #3b82f6;

    display: flex;
    flex-direction: column;
    gap: 0.8rem;
}

.label {
    font-size: 1.2rem;
    font-weight: 500;
    color: var(--land-base-900);
    user-select: none;
}

.editorWrapper {
    overflow: hidden;
    border-radius: 0.8rem;
    border: 1px solid var(--land-base-300);
}

.loading {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 20rem;
    font-size: 1.2rem;
    color: var(--land-base-500);
}

.editor {
    --jse-theme-color: var(--land-primary-500);
    --jse-theme-color-highlight: var(--land-primary-100);
    --jse-background-color: var(--land-base-0);
    --jse-text-color: var(--land-base-900);
    --jse-text-color-inverse: var(--land-base-0);
    --jse-panel-background: var(--land-base-50);
    --jse-panel-border: var(--land-base-300);
    --jse-font-family: 'JetBrains Mono', monospace;
    --jse-font-size-mono: 1.2rem;

    min-height: 20rem;
    background-color: var(--land-base-0);
    color: var(--land-base-900);

    :global(.jse-actions .jse-button.jse-action.jse-primary) {
        font-size: 1.4rem;
    }
}
</style>
