<script setup lang="ts">
/**
 * @description Tooltip: an activator slot plus content shown through a reka
 * portal.
 *
 * The keyframes live in the module block on purpose: CSS Modules scopes the
 * animation name in the `animation:` reference, so the definition has to be local
 * too. A global name would not match, the animation would never play, and Reka
 * would hang on `closed` waiting for `animationend`.
 *
 * The three animation states differ on purpose. `delayed-open` slides in from
 * the side the tooltip appears on, so it looks like it rides out toward the
 * activator; `instant-open` means a jump from a neighboring tooltip, where a
 * full slide-in only jerks, so it keeps the fade alone. Under
 * `prefers-reduced-motion` all three become `animation: none`, which is safe for
 * `closed` too: without an animation Presence unmounts the content right away
 * and never waits for `animationend`.
 */

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
    nudge: 8,
    top: false,
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
 * Side the tooltip is shown on relative to the activator. Reka/floating-ui
 * mirrors the side by itself when there is not enough room (collision
 * avoidance).
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

    &[data-state='instant-open'] {
        animation: bricks-tooltip-fade-in 100ms ease-out;
    }

    &[data-state='closed'] {
        animation: bricks-tooltip-out 100ms ease-in;
    }

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
