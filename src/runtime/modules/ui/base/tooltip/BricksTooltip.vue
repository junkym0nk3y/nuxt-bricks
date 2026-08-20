<script setup lang="ts">
// #region Imports
// Types
import type { IBricksTooltipProps } from './types.d.ts';

// Vue
import { computed, useCssModule } from 'vue';

// Reka UI
import {
    TooltipProvider,
    TooltipRoot,
    TooltipTrigger,
    TooltipPortal,
    TooltipContent,
} from 'reka-ui';
// #endregion

// #region Options
defineOptions({
    inheritAttrs: false,
});
// #endregion

// #region Props
const props = withDefaults(defineProps<IBricksTooltipProps>(), {
    attach: '#bricks-app',
    nudge: 8,
    offsetY: 12,
    offsetX: 12,
    top: false,
    bottom: false,
    left: false,
    right: false,
    hoverable: false,
});
// #endregion

// #region Data
const $style = useCssModule();
// #endregion

// #region Computed
/**
 * Сторона отображения тултипа относительно активатора.
 * Reka/floating-ui сам зеркалит сторону при нехватке места (collision avoidance).
 */
const side = computed<'top' | 'bottom' | 'left' | 'right'>(() => {
    if (props.top) {
        return 'top';
    }
    if (props.left) {
        return 'left';
    }
    if (props.right) {
        return 'right';
    }
    return 'bottom';
});
// #endregion
</script>

<template>
    <TooltipProvider :delay-duration="150" :disable-hoverable-content="!props.hoverable">
        <TooltipRoot>
            <TooltipTrigger as-child>
                <div :class="$style.BricksTooltip" v-bind="$attrs">
                    <slot name="activator"></slot>
                </div>
            </TooltipTrigger>

            <TooltipPortal>
                <TooltipContent
                    :side="side"
                    :side-offset="props.nudge"
                    :class="[$style.tooltipContent, { [$style._hoverable]: props.hoverable }]"
                >
                    <slot name="default">{{ props.text }}</slot>
                </TooltipContent>
            </TooltipPortal>
        </TooltipRoot>
    </TooltipProvider>
</template>

<style module lang="scss">
.BricksTooltip {
    cursor: pointer;
}

.tooltipContent {
    z-index: var(--bricks-z-tooltip);
    pointer-events: none;
    user-select: none;

    // Стартовый сдвиг зависит от стороны появления (tooltip «выезжает» к активатору)
    &[data-side='top'] {
        --bricks-tooltip-offset-y: 0.4rem;
    }

    &[data-side='bottom'] {
        --bricks-tooltip-offset-y: -0.4rem;
    }

    &[data-side='left'] {
        --bricks-tooltip-offset-x: 0.4rem;
    }

    &[data-side='right'] {
        --bricks-tooltip-offset-x: -0.4rem;
    }

    &[data-state='delayed-open'] {
        animation: bricks-tooltip-in 150ms ease-out;
    }

    // instant-open = перескок с соседнего тултипа: полный slide-in дёргается,
    // оставляем только fade
    &[data-state='instant-open'] {
        animation: bricks-tooltip-fade-in 100ms ease-out;
    }

    &[data-state='closed'] {
        animation: bricks-tooltip-out 100ms ease-in;
    }

    // animation: none безопасен и для closed — без анимации Presence
    // размонтирует контент сразу, ожидания animationend нет
    @media (prefers-reduced-motion: reduce) {
        &[data-state='delayed-open'],
        &[data-state='instant-open'],
        &[data-state='closed'] {
            animation: none;
        }
    }

    &._hoverable {
        pointer-events: all;
    }
}

// Keyframes держим в module-блоке: CSS Modules скоупит имя анимации в ссылке
// `animation:` выше, поэтому и определение должно быть локальным (глобальное
// имя не совпало бы → анимация не проигрывалась, а Reka зависал бы на closed).
@keyframes bricks-tooltip-in {
    from {
        opacity: 0;
        transform: translate(var(--bricks-tooltip-offset-x, 0), var(--bricks-tooltip-offset-y, 0));
    }

    to {
        opacity: 1;
        transform: translate(0, 0);
    }
}

@keyframes bricks-tooltip-fade-in {
    from {
        opacity: 0;
    }

    to {
        opacity: 1;
    }
}

@keyframes bricks-tooltip-out {
    from {
        opacity: 1;
    }

    to {
        opacity: 0;
    }
}
</style>
