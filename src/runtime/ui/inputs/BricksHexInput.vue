<script setup lang="ts">
// #region Imports
// Components
import BricksInput from './BricksInput.vue';
import BricksTooltipHint from '../tooltip/BricksTooltipHint.vue';

// Vue
import { computed, ref, watch, useCssModule } from 'vue';

// Types
import type { IBricksHexInputProps, IBricksHexInputEmits } from './types.d.ts';

// Utils
import { validateHex, normalizeHex } from '../../common/utils/main';
// #endregion

// #region Props
const props = withDefaults(defineProps<IBricksHexInputProps>(), {
    disabled: false,
});
// #endregion

// #region Emits
const emit = defineEmits<IBricksHexInputEmits>();
// #endregion

// #region Data
const $style = useCssModule();
// локальное значение, чтобы валидировать/нормализовать ввод
const internal = ref(normalizeHex(props.value));
const error = ref<string | null>(null);
// #endregion

// #region Watchers
watch(
    () => props.value,
    (v) => {
        internal.value = normalizeHex(v);
        error.value = validateHex(internal.value) ? null : 'Неверный HEX';
    }
);
// #endregion

// #region Computed
const disabled = computed(() => Boolean(props.disabled));
// #endregion

// #region Methods
function onColorInput(e: Event) {
    if (disabled.value) {
        return;
    }
    const value = (e.target as HTMLInputElement).value;
    update(value);
}

function onHexInput(value: string) {
    if (disabled.value) {
        return;
    }
    const raw = value.trim();
    internal.value = raw;
    const ok = validateHex(raw);
    error.value = ok ? null : 'Неверный HEX';
    if (ok) {
        update(normalizeHex(raw), false);
    }
}

function update(value: string, fireChange = true) {
    const v = normalizeHex(value);
    internal.value = v;
    emit('update:value', v);
    if (fireChange) {
        emit('change', v);
    }
}
// #endregion
</script>

<template>
    <label :class="[$style.BricksHexInput, disabled && $style._disabled]">
        <div :class="$style.picker">
            <input
                :class="$style.colorInput"
                type="color"
                :value="internal"
                :disabled="disabled"
                @input="onColorInput"
            />
        </div>

        <div :class="$style.inputContainer">
            <BricksInput
                :class="$style.hex"
                :value="internal"
                :disabled="disabled"
                type="text"
                @update:value="onHexInput"
            />

            <BricksTooltipHint v-if="error" :class="$style.hint" :text="error" />
        </div>
    </label>
</template>

<style module lang="scss">
.BricksHexInput {
    display: flex;
    align-items: center;
    color: var(--land-base-900);
    flex-direction: row;

    &._disabled {
        opacity: 0.6;
        cursor: not-allowed;
        pointer-events: none;
    }
}

.picker {
    position: relative;
    overflow: hidden;
    align-items: center;
    width: 3.2rem;
    height: 2.4rem;
    margin-right: 1rem;
    border-radius: var(--border-radius-xs);
    border: 1px solid;
    background: var(--land-base-0);
}

.colorInput {
    width: 100%;
    height: 100%;
    padding: 0;
    border: 0;
    background: transparent;
    cursor: pointer;
    appearance: none;

    &::-webkit-color-swatch-wrapper {
        padding: 0;
    }

    &::-webkit-color-swatch {
        border: none;
        background: transparent;
    }
}

.inputContainer {
    position: relative;
    width: 100%;
}

.hint {
    position: absolute;
    left: 0;
    margin-top: 1rem;
}
</style>
