<script setup lang="ts">
// #region Imports
// Vue
import { ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';

// Components
// Локальный импорт (а не глобальный плагин): vanilla-jsoneditor (~200KB)
// грузится только вместе с этим lazy-редактором, не на каждой странице
import { Mode } from 'vanilla-jsoneditor';
import JsonEditorVue from 'json-editor-vue';
// #endregion

// #region Interfaces
interface IPropertyJsonEditorProps {
    modelValue?: unknown;
    label?: string;
}

interface IPropertyJsonEditorEmits {
    'update:modelValue': [value: unknown];
}
// #endregion

// #region Props
const props = withDefaults(defineProps<IPropertyJsonEditorProps>(), {
    modelValue: () => ({}),
    label: 'JSON',
});
// #endregion

// #region Emits
const emit = defineEmits<IPropertyJsonEditorEmits>();
// #endregion

// #region Data
const { t } = useI18n();
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
        <div :class="$style.BuilderShellSidebarPropertyJsonEditor">
            <span v-if="props.label" :class="$style.label">{{ props.label }}</span>
            <div :class="$style.editorWrapper">
                <JsonEditorVue
                    :model-value="internalValue"
                    :mode="Mode.text"
                    :main-menu-bar="false"
                    :navigation-bar="false"
                    :status-bar="false"
                    :class="$style.editor"
                    @update:model-value="handleUpdate"
                />
            </div>
        </div>

        <template #fallback>
            <div :class="$style.BuilderShellSidebarPropertyJsonEditor">
                <span v-if="props.label" :class="$style.label">{{ props.label }}</span>
                <div :class="$style.editorWrapper">
                    <div :class="$style.loading">{{ t('bricks.properties.editorLoading') }}</div>
                </div>
            </div>
        </template>
    </ClientOnly>
</template>

<style module lang="scss">
.BuilderShellSidebarPropertyJsonEditor {
    /* Фиксируем светлую тему для JSON-редактора */
    --bricks-base-0: #fff;
    --bricks-base-50: #f9fafb;
    --bricks-base-100: #f3f4f6;
    --bricks-base-300: #d1d5db;
    --bricks-base-500: #6b7280;
    --bricks-base-900: #111827;
    --bricks-primary-100: #dbeafe;
    --bricks-primary-500: #3b82f6;

    display: flex;
    flex-direction: column;
    gap: 0.8rem;
}

.label {
    font-size: 1.2rem;
    font-weight: 500;
    color: var(--bricks-base-900);
    user-select: none;
}

.editorWrapper {
    overflow: hidden;
    border-radius: var(--bricks-border-radius-xs);
    border: 1px solid var(--bricks-base-300);
}

.loading {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 20rem;
    font-size: 1.2rem;
    color: var(--bricks-base-500);
}

.editor {
    --jse-theme-color: var(--bricks-primary-500);
    --jse-theme-color-highlight: var(--bricks-primary-100);
    --jse-background-color: var(--bricks-base-0);
    --jse-text-color: var(--bricks-base-900);
    --jse-text-color-inverse: var(--bricks-base-0);
    --jse-panel-background: var(--bricks-base-50);
    --jse-panel-border: var(--bricks-base-300);
    --jse-font-family: 'JetBrains Mono', monospace;
    --jse-font-size-mono: 1.2rem;

    min-height: 20rem;
    background-color: var(--bricks-base-0);
    color: var(--bricks-base-900);

    :global(.jse-actions .jse-button.jse-action.jse-primary) {
        font-size: 1.4rem;
    }
}
</style>
