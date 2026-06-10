<script setup lang="ts">
// #region Imports
// Types
import type { IToolbarColorPicker } from '../../editor/types/text-editor-toolbar.d.ts';

// Vue
import { ref, computed, watch } from 'vue';

// VueUse
import { onClickOutside, useElementBounding } from '@vueuse/core';

// Utils
import { validateHex, normalizeHex } from '../../common/utils/main';
// #endregion

// #region Props
const props = withDefaults(
    defineProps<{
        item: IToolbarColorPicker;
    }>(),
    {}
);
// #endregion

// #region Data
const triggerRef = ref<HTMLElement | null>(null);
const popupRef = ref<HTMLElement | null>(null);
const isOpen = ref(false);
const hexInput = ref('');
const hasError = ref(false);

const { bottom: triggerBottom, left: triggerLeft } = useElementBounding(triggerRef);
// #endregion

// #region Computed
/**
 * Стили позиционирования popup.
 */
const popupStyle = computed(() => ({
    position: 'fixed' as const,
    top: `${triggerBottom.value + 4}px`,
    left: `${triggerLeft.value}px`,
    zIndex: 10001,
}));
// #endregion

// #region Methods
/**
 * Переключает открытие/закрытие попапа.
 */
function togglePopup(): void {
    isOpen.value = !isOpen.value;
    if (isOpen.value) {
        hexInput.value = props.item.value || '#000000';
        hasError.value = false;
    }
}

/**
 * Обрабатывает выбор цвета через нативный color picker.
 */
function handleColorInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    hexInput.value = value;
    hasError.value = false;
    props.item.onChange(value);
}

/**
 * Обрабатывает ввод hex значения в текстовое поле.
 */
function handleHexInput(event: Event): void {
    const raw = (event.target as HTMLInputElement).value.trim();
    hexInput.value = raw;

    if (validateHex(raw)) {
        hasError.value = false;
        const normalized = normalizeHex(raw);
        props.item.onChange(normalized);
    } else {
        hasError.value = raw.length > 0;
    }
}

/**
 * Обрабатывает нажатия клавиш в hex поле.
 */
function handleKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
        event.preventDefault();
        isOpen.value = false;
    }
}
// #endregion

// #region Lifecycle
onClickOutside(
    triggerRef,
    () => {
        isOpen.value = false;
    },
    { ignore: [popupRef] }
);

watch(
    () => props.item.value,
    (newValue) => {
        if (isOpen.value) {
            hexInput.value = newValue || '#000000';
        }
    }
);
// #endregion
</script>

<template>
    <div :class="$style.BricksToolbarColorPicker" @mousedown.prevent>
        <button
            ref="triggerRef"
            type="button"
            :class="$style.triggerButton"
            :title="props.item.title"
            @mousedown.prevent
            @click.prevent="togglePopup"
        >
            <span v-if="props.item.icon" :class="$style.triggerIcon">
                <BricksLandIcon :icon="props.item.icon" />
            </span>
            <span
                :class="$style.colorSwatch"
                :style="{ backgroundColor: props.item.value || '#000000' }"
            />
        </button>

        <Teleport to="body">
            <Transition name="fade-fast">
                <div
                    v-if="isOpen"
                    ref="popupRef"
                    :class="$style.popup"
                    :style="popupStyle"
                    @mousedown.prevent
                >
                    <!-- Native color picker -->
                    <div :class="$style.colorPickerRow">
                        <input
                            type="color"
                            :class="$style.nativeColorPicker"
                            :value="hexInput"
                            @mousedown.stop
                            @input="handleColorInput"
                        />
                    </div>

                    <!-- Hex input -->
                    <div :class="$style.hexInputRow">
                        <span :class="$style.hexLabel">HEX</span>
                        <input
                            type="text"
                            :class="[$style.hexInput, { [$style._error]: hasError }]"
                            :value="hexInput"
                            placeholder="#000000"
                            @input="handleHexInput"
                            @keydown="handleKeydown"
                            @mousedown.stop
                        />
                    </div>
                    <div v-if="hasError" :class="$style.errorText">Неверный HEX</div>
                </div>
            </Transition>
        </Teleport>
    </div>
</template>

<style module lang="scss">
.BricksToolbarColorPicker {
    display: inline-flex;
}

.triggerButton {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    flex-shrink: 0;
    height: var(--toolbar-btn-size, 2.6rem);
    padding: 0 0.4rem;
    border-radius: var(--border-radius-xs);
    border: 1px solid var(--land-base-200);
    background: transparent;
    color: var(--land-base-600);
    transition: all var(--default-transition);
    cursor: pointer;

    &:hover {
        border-color: var(--land-primary);
        color: var(--land-primary);
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

.colorSwatch {
    flex-shrink: 0;
    width: 1.4rem;
    height: 1.4rem;
    border-radius: 0.2rem;
    border: 1px solid var(--land-base-300);
}

.popup {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    width: 18rem;
    padding: 0.8rem;
    border-radius: var(--border-radius-sm);
    border: 1px solid var(--land-base-200);
    background: var(--land-base-0);
    box-shadow: var(--shadow-md);
}

.colorPickerRow {
    display: flex;
    justify-content: center;
}

.nativeColorPicker {
    width: 100%;
    height: 3.2rem;
    padding: 0.2rem;
    border-radius: var(--border-radius-xs);
    border: 1px solid var(--land-base-200);
    background: transparent;
    cursor: pointer;

    &::-webkit-color-swatch-wrapper {
        padding: 0;
    }

    &::-webkit-color-swatch {
        border-radius: calc(var(--border-radius-xs) - 0.1rem);
        border: none;
    }
}

.hexInputRow {
    display: flex;
    align-items: center;
    gap: 0.6rem;
}

.hexLabel {
    flex-shrink: 0;
    font-size: 1.2rem;
    font-weight: 600;
    color: var(--land-base-500);
}

.hexInput {
    flex: 1 1 auto;
    min-width: 0;
    height: 2.4rem;
    padding: 0 0.6rem;
    border-radius: var(--border-radius-xs);
    border: 1px solid var(--land-base-200);
    background: var(--land-base-50);
    font-family: monospace;
    font-size: 1.2rem;
    color: var(--land-base-800);
    transition: border-color var(--default-transition);

    &::placeholder {
        color: var(--land-base-400);
    }

    &:focus {
        border-color: var(--land-primary);
        outline: none;
    }

    &._error {
        border-color: var(--land-danger-600, #dc2626);
    }
}

.errorText {
    font-size: 1.1rem;
    color: var(--land-danger-600, #dc2626);
}
</style>
