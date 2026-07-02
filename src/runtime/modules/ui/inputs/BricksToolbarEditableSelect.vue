<script setup lang="ts">
// #region Imports
// Types
import type { IToolbarEditableSelect } from './textEditorToolbar.d.ts';

// Vue
import { ref, computed, nextTick } from 'vue';

// Reka UI
import {
    ComboboxRoot,
    ComboboxAnchor,
    ComboboxTrigger,
    ComboboxPortal,
    ComboboxContent,
    ComboboxViewport,
    ComboboxItem,
    type AcceptableValue,
} from 'reka-ui';
// #endregion

// #region Props
const props = withDefaults(
    defineProps<{
        item: IToolbarEditableSelect;
    }>(),
    {}
);
// #endregion

// #region Data
const customInputRef = ref<HTMLInputElement | null>(null);
const isOpen = ref(false);
const customValue = ref('');
const hasError = ref(false);
// #endregion

// #region Computed
/**
 * Краткое отображение текущего значения для триггер-кнопки.
 */
const displayValue = computed<string>(() => {
    if (!props.item.value) {
        return '';
    }

    const match = props.item.options.find((opt) => opt.value === props.item.value);
    return match ? match.label : props.item.value;
});
// #endregion

// #region Methods
/**
 * Сбрасывает состояние кастомного ввода при открытии/закрытии попапа.
 *
 * @param open - Новое состояние открытости.
 */
function onUpdateOpen(open: boolean): void {
    isOpen.value = open;
    hasError.value = false;
    customValue.value = '';
}

/**
 * Выбирает значение из списка пресетов.
 *
 * @param value - Значение выбранной опции.
 */
function handleOptionSelect(value: AcceptableValue): void {
    if (typeof value !== 'string') {
        return;
    }

    props.item.onChange(value);
    isOpen.value = false;
}

/**
 * Подтверждает введённое пользовательское значение.
 */
function handleCustomConfirm(): void {
    const raw = customValue.value.trim();
    if (!raw) {
        return;
    }

    if (props.item.validateInput && !props.item.validateInput(raw)) {
        hasError.value = true;
        return;
    }

    const transformed = props.item.transformInput ? props.item.transformInput(raw) : raw;
    props.item.onChange(transformed);
    isOpen.value = false;
    customValue.value = '';
    hasError.value = false;
}

/**
 * Санитизирует ввод: запятую → точку, убирает буквы, ограничивает формат до X.XX.
 * Допускает опциональный минус в начале, % или rem в конце.
 */
function sanitizeNumericInput(raw: string): string {
    const trimmed = raw.trimEnd();
    const endsWithPercent = trimmed.endsWith('%');
    const endsWithRem = trimmed.endsWith('rem') || trimmed.endsWith('re') || trimmed.endsWith('r');
    let result = raw.replace(',', '.');

    // Убираем всё кроме цифр, точки и минуса
    result = result.replace(/[^\d.-]/g, '');

    // Минус только в начале
    const hasLeadingMinus = result.startsWith('-');
    result = result.replace(/-/g, '');
    if (hasLeadingMinus) {
        result = `-${result}`;
    }

    // Только одна точка
    const parts = result.split('.');
    if (parts.length > 2) {
        result = `${parts[0]}.${parts.slice(1).join('')}`;
    }

    // Максимум 3 знака после точки
    const dotIndex = result.indexOf('.');
    if (dotIndex !== -1 && result.length - dotIndex - 1 > 3) {
        result = result.slice(0, dotIndex + 4);
    }

    if (endsWithPercent) {
        result += '%';
    } else if (endsWithRem) {
        const suffix = trimmed.endsWith('rem') ? 'rem' : trimmed.endsWith('re') ? 're' : 'r';
        result += suffix;
    }

    return result;
}

/**
 * Обрабатывает ввод в кастомном поле.
 */
function handleCustomInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    const sanitized = sanitizeNumericInput(input.value);
    customValue.value = sanitized;
    input.value = sanitized;
    hasError.value = false;
}

/**
 * Обрабатывает нажатия клавиш в кастомном поле.
 */
function handleCustomKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
        event.preventDefault();
        handleCustomConfirm();
    } else if (event.key === 'Escape') {
        event.preventDefault();
        isOpen.value = false;
    }
}

/**
 * Фокусирует поле ввода при открытии секции кастомного ввода.
 */
async function focusCustomInput(): Promise<void> {
    await nextTick();
    customInputRef.value?.focus();
}
// #endregion
</script>

<template>
    <ComboboxRoot
        :open="isOpen"
        :model-value="props.item.value"
        ignore-filter
        :class="$style.BricksToolbarEditableSelect"
        @mousedown.prevent
        @update:open="onUpdateOpen"
        @update:model-value="handleOptionSelect"
    >
        <ComboboxAnchor as-child>
            <ComboboxTrigger
                :class="[$style.triggerButton, { [$style._hasValue]: !!props.item.value }]"
                :title="props.item.title"
                @mousedown.prevent
            >
                <span v-if="props.item.icon" :class="$style.triggerIcon">
                    <BricksIcon :icon="props.item.icon" />
                </span>
                <span v-if="displayValue" :class="$style.triggerValue">{{ displayValue }}</span>
            </ComboboxTrigger>
        </ComboboxAnchor>

        <ComboboxPortal>
            <ComboboxContent
                position="popper"
                :side-offset="4"
                align="start"
                :class="$style.popup"
                @mousedown.prevent
            >
                <!-- Preset options -->
                <ComboboxViewport :class="$style.optionsList">
                    <ComboboxItem
                        v-for="option in props.item.options"
                        :key="option.value"
                        :value="option.value"
                        :class="[
                            $style.optionItem,
                            { [$style._selected]: option.value === props.item.value },
                        ]"
                        @mousedown.prevent
                    >
                        {{ option.label }}
                    </ComboboxItem>
                </ComboboxViewport>

                <!-- Custom input -->
                <div :class="$style.divider" />
                <div :class="$style.customInputRow">
                    <input
                        ref="customInputRef"
                        type="text"
                        :class="[$style.customInput, { [$style._error]: hasError }]"
                        :value="customValue"
                        :placeholder="props.item.customInputPlaceholder || 'Значение'"
                        @input="handleCustomInput"
                        @keydown="handleCustomKeydown"
                        @mousedown.stop
                        @vue:mounted="focusCustomInput"
                    />
                    <button
                        type="button"
                        :class="$style.confirmButton"
                        :disabled="!customValue.trim()"
                        @mousedown.prevent
                        @click.prevent="handleCustomConfirm"
                    >
                        ✓
                    </button>
                </div>
                <div v-if="hasError" :class="$style.errorText">Некорректное значение</div>
            </ComboboxContent>
        </ComboboxPortal>
    </ComboboxRoot>
</template>

<style module lang="scss">
.BricksToolbarEditableSelect {
    display: inline-flex;
}

.triggerButton {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    flex-shrink: 0;
    height: var(--toolbar-btn-size, 2.6rem);
    padding: 0 0.6rem;
    border-radius: var(--border-radius-xs);
    border: 1px solid var(--bricks-base-200);
    background: transparent;
    font-size: var(--toolbar-font-size, 1.2rem);
    color: var(--bricks-base-600);
    transition: all var(--default-transition);
    cursor: pointer;

    &:hover {
        border-color: var(--bricks-primary);
        color: var(--bricks-primary);
    }

    &._hasValue {
        color: var(--bricks-base-800);
    }
}

.triggerIcon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;

    svg {
        width: 1.6rem;
        height: 1.6rem;
    }
}

.triggerValue {
    overflow: hidden;
    max-width: 6rem;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.popup {
    z-index: 10001;
    display: flex;
    flex-direction: column;
    width: 16rem;
    padding: 0.6rem;
    border-radius: var(--border-radius-sm);
    border: 1px solid var(--bricks-base-200);
    background: var(--bricks-base-0);
    box-shadow: var(--shadow-md);
}

.optionsList {
    overflow-y: auto;
    display: flex;
    max-height: 20rem;
    flex-direction: column;
    gap: 0.2rem;
}

.optionItem {
    display: flex;
    align-items: center;
    width: 100%;
    padding: 0.4rem 0.8rem;
    border-radius: var(--border-radius-xs);
    border: none;
    background: transparent;
    text-align: left;
    white-space: nowrap;
    font-size: 1.2rem;
    color: var(--bricks-base-700);
    transition:
        background var(--default-transition),
        color var(--default-transition);
    cursor: pointer;

    &:hover,
    &[data-highlighted] {
        background: var(--bricks-base-100);
    }

    &._selected {
        background: var(--bricks-primary-100, rgb(37 99 235 / 15%));
        font-weight: 600;
        color: var(--bricks-primary);
    }
}

.divider {
    margin: 0.4rem 0;
    border-top: 1px solid var(--bricks-base-200);
}

.customInputRow {
    display: flex;
    align-items: center;
    gap: 0.4rem;
}

.customInput {
    flex: 1 1 auto;
    min-width: 0;
    height: 2.4rem;
    padding: 0 0.6rem;
    border-radius: var(--border-radius-xs);
    border: 1px solid var(--bricks-base-200);
    background: var(--bricks-base-50);
    font-size: 1.2rem;
    color: var(--bricks-base-800);
    transition: border-color var(--default-transition);

    &::placeholder {
        color: var(--bricks-base-400);
    }

    &:focus {
        border-color: var(--bricks-primary);
        outline: none;
    }

    &._error {
        border-color: var(--bricks-danger-600, #dc2626);
    }
}

.confirmButton {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    width: 2.4rem;
    height: 2.4rem;
    border-radius: var(--border-radius-xs);
    border: 1px solid var(--bricks-base-200);
    background: var(--bricks-primary);
    font-size: 1.2rem;
    font-weight: 600;
    color: #fff;
    transition: opacity var(--default-transition);
    cursor: pointer;

    &:hover {
        opacity: 0.85;
    }

    &:disabled {
        opacity: 0.4;
        cursor: default;
    }
}

.errorText {
    margin-top: 0.2rem;
    font-size: 1.1rem;
    color: var(--bricks-danger-600, #dc2626);
}
</style>
