<script setup lang="ts">
/**
 * @description Полоса действий модалки: кнопки прижаты вправо, слот `leading` —
 * группа, которая остаётся слева («Удалить», «Пропустить»).
 *
 * Левая группа отдельным слотом с `margin-right: auto`, а не
 * `justify-content: space-between` у всей полосы: со `space-between` три кнопки
 * разъезжаются по всей ширине, и «Отмена» повисает в середине.
 */

// #region Imports
// Types
import type { IBricksModalFooterProps } from './types.d.ts';

// Vue
import { computed, useCssModule } from 'vue';
// #endregion

// #region Props
const props = withDefaults(defineProps<IBricksModalFooterProps>(), {
    size: 'md',
    variant: 'bar',
});
// #endregion

// #region Data
const $style = useCssModule();
// #endregion

// #region Computed
const rootClasses = computed(() => [
    $style.BricksModalFooter,
    $style[`_${props.size}`],
    $style[`_${props.variant}`],
]);
// #endregion
</script>

<template>
    <div :class="rootClasses">
        <div v-if="$slots.leading" :class="$style.leading">
            <slot name="leading" />
        </div>

        <slot />
    </div>
</template>

<style module lang="scss">
.BricksModalFooter {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    flex-shrink: 0;
    gap: 0.8rem;

    &._bar {
        border-top: 1px solid var(--bricks-base-200);
    }

    &._bar,
    &._plain {
        &._md {
            padding: 1.6rem 2rem;
        }

        &._lg {
            padding: 1.6rem 2.4rem;
        }
    }

    /* Футер внутри формы: её отступы уже действуют, нужен только зазор от
       последнего поля. */
    &._inline {
        padding-top: 0.4rem;
    }
}

.leading {
    display: flex;
    align-items: center;
    margin-right: auto;
    gap: 0.8rem;
}
</style>
