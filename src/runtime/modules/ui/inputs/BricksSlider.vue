<script setup lang="ts">
/**
 * @description Ползунок непрерывного значения. В ките его не было: там, где
 * значение вводят числом, стоит `BricksInput`, а дорожка нужна кадрированию
 * фото — масштаб выбирают глазами, а не набором цифры.
 *
 * Поведение (клавиатура, шаг, перетаскивание, RTL) даёт reka-ui, как у остальных
 * полей кита. Наша часть — один ползунок вместо диапазона: `SliderRoot` работает
 * с массивом значений, наружу отдаётся число, потому что двух ручек ни у одного
 * потребителя нет и появление второй означало бы другой компонент.
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
 * Отдаёт первое значение наружу числом.
 *
 * Пустой массив отсекается: reka сообщает об изменении и в момент, когда ручка
 * снята, а `undefined` в числовом пропе превратил бы масштаб в `NaN`.
 *
 * @param value - Значения ручек от reka.
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
