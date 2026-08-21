<script setup lang="ts">
/**
 * @description Slider for a continuous value. The kit had none: where a value is
 * typed as a number there is `BricksInput`, and a track is what photo cropping
 * needs — the scale is chosen by eye, not by typing a figure.
 *
 * The behavior (keyboard, step, dragging, RTL) comes from reka-ui, as with the
 * other fields of the kit. Our part is a single thumb instead of a range:
 * `SliderRoot` works with an array of values, while a number goes out, because
 * no consumer has two thumbs and a second one would mean a different component.
 */

// #region Imports
// Types
import type { IBricksSliderProps, IBricksSliderEmits } from './types.d.ts';

// Vue
import { computed } from 'vue';

// Reka UI
import { SliderRoot, SliderRange, SliderThumb, SliderTrack } from 'reka-ui';
// #endregion

// #region Props
const props = withDefaults(defineProps<IBricksSliderProps>(), {
    min: 0,
    max: 100,
    step: 1,
    disabled: false,
});
// #endregion

// #region Emits
const emit = defineEmits<IBricksSliderEmits>();
// #endregion

// #region Computed
const modelValue = computed<number[]>(() => [props.value]);
// #endregion

// #region Methods
/**
 * Sends the first value out as a number.
 *
 * An empty array is cut off: reka reports a change at the moment the thumb is
 * removed too, and an `undefined` in a numeric prop would turn the scale into
 * `NaN`.
 *
 * @param value - Thumb values from reka.
 */
function handleValueChange(value: number[] | undefined): void {
    const [next] = value ?? [];

    if (typeof next !== 'number' || next === props.value) {
        return;
    }

    emit('update:value', next);
}
// #endregion
</script>

<template>
    <SliderRoot
        :model-value="modelValue"
        :min="props.min"
        :max="props.max"
        :step="props.step"
        :disabled="props.disabled"
        :class="$style.BricksSlider"
        @update:model-value="handleValueChange"
    >
        <SliderTrack :class="$style.track">
            <SliderRange :class="$style.range" />
        </SliderTrack>

        <SliderThumb :class="$style.thumb" :aria-label="props.label" />
    </SliderRoot>
</template>

<style module lang="scss">
.BricksSlider {
    position: relative;
    display: flex;
    align-items: center;
    width: 100%;
    height: 2rem;
    touch-action: none;
    user-select: none;

    &[data-disabled] {
        opacity: 0.5;
        cursor: not-allowed;
    }
}

.track {
    position: relative;
    overflow: hidden;
    flex: 1;
    height: 0.4rem;
    border-radius: var(--bricks-border-radius-pill);
    background: var(--bricks-base-200);
}

.range {
    position: absolute;
    height: 100%;
    border-radius: var(--bricks-border-radius-pill);
    background: var(--bricks-primary-500);
}

.thumb {
    display: block;
    width: 1.6rem;
    height: 1.6rem;
    border-radius: var(--bricks-border-radius-pill);
    border: 1px solid var(--bricks-primary-500);
    background: var(--bricks-base-0);
    transition: box-shadow var(--bricks-default-transition);
    cursor: grab;
    box-shadow: var(--bricks-shadow-sm);

    &:focus-visible {
        outline: none;
        box-shadow: var(--bricks-shadow-focus);
    }

    &:active {
        cursor: grabbing;
    }
}
</style>
