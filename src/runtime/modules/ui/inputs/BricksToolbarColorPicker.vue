<script setup lang="ts">
// #region Imports
// Types
import type { IToolbarColorPicker } from './textEditorToolbar.d.ts';

// Vue
import { ref, computed, watch, type ComponentPublicInstance } from 'vue';
import { useI18n } from 'vue-i18n';

// VueUse
import { onClickOutside, useElementBounding } from '@vueuse/core';

// Utils
import { validateHex, normalizeHex } from '../../common/utils/main';

// Components
import BricksPopoverSurface from '../base/popover/BricksPopoverSurface.vue';
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
const { t } = useI18n();

const triggerRef = ref<HTMLElement | null>(null);
/**
 * The popup is a surface component rather than a div: `onClickOutside` unwraps
 * `$el` by itself (`unrefElement`), so in the ignore list an instance works just
 * like an element — but the type has to allow for that.
 */
const popupRef = ref<ComponentPublicInstance | null>(null);
const isOpen = ref(false);
const hexInput = ref('');
const hasError = ref(false);

const { bottom: triggerBottom, left: triggerLeft } = useElementBounding(triggerRef);
// #endregion

// #region Computed
/**
 * Positioning styles of the popup.
 *
 * The layer is taken from the shared `--bricks-z-*` scale rather than as a
 * number: the previous 10001 stood above the whole scale (its top is 1800), so an
 * open picker stayed on top of the session block and the loader — that is,
 * exactly where everything else is already blocked.
 */
const popupStyle = computed(() => ({
    position: 'fixed' as const,
    top: `${triggerBottom.value + 4}px`,
    left: `${triggerLeft.value}px`,
    zIndex: 'var(--bricks-z-popover)',
}));
// #endregion

// #region Methods
/**
 * Toggles the popup open and closed.
 */
function togglePopup(): void {
    isOpen.value = !isOpen.value;
    if (isOpen.value) {
        hexInput.value = props.item.value || '#000000';
        hasError.value = false;
    }
}

/**
 * Handles a color choice made through the native color picker.
 *
 * @param event - Input event of the native picker.
 */
function handleColorInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    hexInput.value = value;
    hasError.value = false;
    props.item.onChange(value);
}

/**
 * Handles a hex value typed into the text field.
 *
 * @param event - Input event.
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
 * Handles key presses in the hex field.
 *
 * @param event - Keyboard event.
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
                <BricksIcon :icon="props.item.icon" />
            </span>
            <span v-else :class="$style.triggerLetter">A</span>
            <span
                :class="$style.colorSwatch"
                :style="{ backgroundColor: props.item.value || '#000000' }"
            />
        </button>

        <Teleport to="body">
            <Transition name="bricks-fade-fast">
                <BricksPopoverSurface
                    v-if="isOpen"
                    ref="popupRef"
                    density="roomy"
                    :class="$style.popup"
                    :style="popupStyle"
                    @mousedown.prevent
                >
                    <div :class="$style.colorPickerRow">
                        <input
                            type="color"
                            :class="$style.nativeColorPicker"
                            :value="hexInput"
                            @mousedown.stop
                            @input="handleColorInput"
                        />
                    </div>

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
                    <div v-if="hasError" :class="$style.errorText">
                        {{ t('bricks.validation.invalidHex') }}
                    </div>
                </BricksPopoverSurface>
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
    border-radius: var(--bricks-border-radius-xs);
    border: 1px solid var(--bricks-base-200);
    background: transparent;
    color: var(--bricks-base-600);
    transition: all var(--bricks-default-transition);
    cursor: pointer;

    &:hover {
        border-color: var(--bricks-primary);
        color: var(--bricks-primary);
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

.triggerLetter {
    flex-shrink: 0;
    padding-left: 0.2rem;
    font-size: 1.4rem;
    font-weight: 600;
    line-height: 1;
}

.colorSwatch {
    flex-shrink: 0;
    width: 1.4rem;
    height: 1.4rem;
    border-radius: 0.2rem;
    border: 1px solid var(--bricks-base-300);
}

.popup {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    width: 18rem;
}

.colorPickerRow {
    display: flex;
    justify-content: center;
}

.nativeColorPicker {
    width: 100%;
    height: 3.2rem;
    padding: 0.2rem;
    border-radius: var(--bricks-border-radius-xs);
    border: 1px solid var(--bricks-base-200);
    background: transparent;
    cursor: pointer;

    &::-webkit-color-swatch-wrapper {
        padding: 0;
    }

    &::-webkit-color-swatch {
        border-radius: calc(var(--bricks-border-radius-xs) - 0.1rem);
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
    color: var(--bricks-base-500);
}

.hexInput {
    flex: 1 1 auto;
    min-width: 0;
    height: 2.4rem;
    padding: 0 0.6rem;
    border-radius: var(--bricks-border-radius-xs);
    border: 1px solid var(--bricks-base-200);
    background: var(--bricks-base-50);
    font-family: monospace;
    font-size: 1.2rem;
    color: var(--bricks-base-800);
    transition: border-color var(--bricks-default-transition);

    &::placeholder {
        color: var(--bricks-text-muted);
    }

    &:focus {
        border-color: var(--bricks-primary);
        outline: none;
    }

    &._error {
        border-color: var(--bricks-danger-600, #dc2626);
    }
}

.errorText {
    font-size: 1.2rem;
    color: var(--bricks-danger-600, #dc2626);
}
</style>
