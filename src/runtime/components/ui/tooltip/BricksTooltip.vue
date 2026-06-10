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
    attach: '#app',
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

// #region Emits
const emit = defineEmits<{
    enter: [];
    blur: [];
}>();
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

// #region Methods
/**
 * Пробрасывает смену состояния открытия в legacy-эмиты enter/blur.
 *
 * @param open - Открыт ли тултип.
 */
function onOpenChange(open: boolean): void {
    if (open) {
        emit('enter');
        return;
    }

    emit('blur');
}
// #endregion
</script>

<template>
    <TooltipProvider :delay-duration="150" :disable-hoverable-content="!props.hoverable">
        <TooltipRoot @update:open="onOpenChange">
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
    z-index: 10001;
    pointer-events: none;
    user-select: none;

    &._hoverable {
        pointer-events: all;
    }
}
</style>
