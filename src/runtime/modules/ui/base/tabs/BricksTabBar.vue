<script setup lang="ts">
/**
 * @description Segmented switch: one component instead of hand-written rows of
 * buttons and chips. Four variants (`segmented`, `outline`, `underline`,
 * `ghost`), the keyboard and the group semantics are shared by every consumer.
 *
 * A group of buttons, not tabs. The `tablist`/`tab` roles promise a screen
 * reader a panel per tab, but none of the consumers here has panels: the choice
 * switches a canvas mode or filters an already visible list. Hence
 * `ToggleGroupRoot` under the hood (`role="group"`, `aria-pressed` on the
 * buttons) rather than `TabsRoot`. As a side effect that also removed the tab
 * trap: `Tabs` activates a tab on receiving focus, so tabbing into the group
 * changed the value by itself; `ToggleGroup` changes it only on a click or
 * Enter/Space.
 *
 * The behavior (roving tabindex, arrow keys wrapping around, Home/End, skipping
 * disabled ones, RTL) comes from reka-ui — the checkbox, the select and the modal
 * in this project are already built on it. Our part is only the props, the button
 * markup and the styles.
 *
 * The tooltip needs `role="presentation"` on its wrapper: without it an extra
 * element stands between the group and the button and gets in the way of reading
 * them as one whole.
 *
 * Every tab stands in a wrapper of its own, whether or not anything goes next to
 * it. The wrapper exists for the `item-action` slot — a consumer action (a delete
 * button and the like) that cannot live inside `ToggleGroupItem`: a button within
 * a button is not allowed, and a second group item would change the selection on
 * a click. It is rendered unconditionally so that the bar keeps one DOM and one
 * CSS branch; `display: contents` will not do in its place, because a box of its
 * own is exactly what carries the underline, the width and `flex: 1`. The extra
 * level costs reka nothing: it collects group items across the whole subtree by
 * `data-reka-collection-item`, so the roving tabindex and the arrow keys still
 * see only the toggles, while the action stays an ordinary Tab stop.
 *
 * The underline of `_underline` therefore lives on the wrapper rather than on the
 * tab: on a tab with an action it would otherwise break off under the caption. The
 * wrapper reads the selected state from `modelValue` instead of asking the DOM —
 * the bar already knows the answer, and a computed class is checkable by a test
 * where `:has` is not.
 *
 * The track line under `_underline` is not the bar's to draw: a bar of tabs does
 * not know how wide its track is. Its only consumer stands in a row shared with a
 * create button and a managing toggle, and the baseline belongs to that whole row —
 * a line of the bar's own would have doubled it under the tabs and stopped short of
 * everything else. A row that wants a line draws it on itself.
 *
 * Style notes that the markup no longer says out loud: `_wrap` wraps lines
 * instead of overflowing the container, because the bar has no width of its own
 * and tabs do not wrap by words (`white-space: nowrap`); the bar radius equals
 * the tab radius plus its padding, so at `radius="sm"` the tab takes `1rem` and
 * the bar needs `1.2rem`, otherwise the corners drift apart; and `_ghost` has no
 * bar at all — the row stands directly on the background of its neighbors (the
 * bottom canvas bar is one panel shared with the zoom and history buttons), and
 * only the active tab gets a backing. With a segmented bar such a row would fall
 * apart into two blocks.
 */

// #region Imports
// Types
import type {
    IBricksTabBarProps,
    IBricksTabBarEmits,
    IBricksTabBarItemProps,
    IBricksTabBarSlots,
    IBricksTabItem,
} from './types.d.ts';

// Vue
import { computed, useCssModule } from 'vue';

// Reka UI
import { ToggleGroupRoot } from 'reka-ui';

// Components
import BricksTabBarItem from './BricksTabBarItem.vue';
import BricksTooltip from '../tooltip/BricksTooltip.vue';
import BricksTooltipHint from '../tooltip/BricksTooltipHint.vue';
// #endregion

// #region Props
const props = withDefaults(defineProps<IBricksTabBarProps>(), {
    variant: 'segmented',
    size: 'sm',
    tone: 'neutral',
    radius: undefined,
    iconOnly: false,
    block: false,
    wrap: false,
});
// #endregion

// #region Emits
const emit = defineEmits<IBricksTabBarEmits>();

defineSlots<IBricksTabBarSlots>();
// #endregion

// #region Data
const $style = useCssModule();
// #endregion

// #region Computed
const classList = computed(() => ({
    [$style[`_${props.variant}`]]: true,
    [$style._radiusSm]: props.radius === 'sm',
    [$style._block]: props.block,
    [$style._wrap]: props.wrap,
}));
// #endregion

// #region Methods
/**
 * Assembles the props of an element: the tab markup is the same for both template
 * branches (with and without a tooltip), so the props are computed in one place.
 *
 * @param item - Tab description.
 */
function getItemProps(item: IBricksTabItem): IBricksTabBarItemProps {
    return {
        item,
        hasAction: Boolean(item.hasAction),
        variant: props.variant,
        size: props.size,
        tone: props.tone,
        radius: props.radius,
        iconOnly: props.iconOnly,
        block: props.block,
    };
}

/**
 * Assembles the classes of the wrapper of an element: the variant is needed there
 * because the underline is drawn by the wrapper, and the selected state because
 * the underline shows only under the chosen tab.
 *
 * @param item - Tab description.
 */
function getItemClassList(item: IBricksTabItem): Record<string, boolean> {
    return {
        [$style[`_${props.variant}`]]: true,
        [$style._selected]: item.value === props.modelValue,
        [$style._hasAction]: Boolean(item.hasAction),
        [$style._block]: props.block,
    };
}

/**
 * Sends the choice upwards. Two cases are cut off, in which the group reports an
 * event but the choice does not change:
 *
 * 1. `undefined` — pressing the selected button again. `ToggleGroup` treats that
 *    as clearing the selection, and a group of modes cannot stay empty: a canvas
 *    without a viewport and a list without a filter make no sense.
 * 2. The same value — consumers answer an update with a request or a repaint, and
 *    an extra repeat would cost them extra work.
 *
 * The parameter is declared as `unknown`: `ToggleGroup` types the event for both
 * modes at once (in `multiple` an array arrives), so narrowing it to a string is
 * only possible with a check on the spot.
 *
 * @param value - Value of the pressed button; empty when the selection is cleared.
 */
function handleValueChange(value: unknown): void {
    if (typeof value !== 'string' || value === props.modelValue) {
        return;
    }

    emit('update:modelValue', value);
}
// #endregion
</script>

<template>
    <ToggleGroupRoot
        type="single"
        :class="[$style.BricksTabBar, classList]"
        :model-value="props.modelValue"
        :aria-label="props.groupLabel"
        @update:model-value="handleValueChange"
    >
        <div
            v-for="item in props.items"
            :key="item.value"
            role="presentation"
            :class="[$style.item, getItemClassList(item)]"
        >
            <BricksTooltip v-if="item.tooltip" top role="presentation" :class="$style.tooltip">
                <template #activator>
                    <BricksTabBarItem v-bind="getItemProps(item)" />
                </template>

                <template #default>
                    <BricksTooltipHint :text="item.tooltip" />
                </template>
            </BricksTooltip>

            <BricksTabBarItem v-else v-bind="getItemProps(item)" />

            <slot name="item-action" :item="item" />
        </div>
    </ToggleGroupRoot>
</template>

<style module lang="scss">
.BricksTabBar {
    display: inline-flex;
    align-items: center;

    &._block {
        display: flex;
        width: 100%;
    }

    &._wrap {
        flex-wrap: wrap;
    }

    &._segmented {
        gap: 0.2rem;
        padding: 0.2rem;
        border-radius: var(--bricks-border-radius-xs);
        background: var(--bricks-base-100);

        &._radiusSm {
            border-radius: calc(var(--bricks-border-radius-sm) + 0.2rem);
        }
    }

    &._ghost {
        gap: 0.2rem;
    }

    &._outline {
        gap: 0.8rem;
    }

    &._underline {
        gap: 0.8rem;
    }
}

.item {
    position: relative;
    display: inline-flex;
    align-items: center;

    &._block {
        flex: 1;
        min-width: 0;

        .tooltip {
            flex: 1;
        }
    }

    &._hasAction {
        padding-right: 0.8rem;
    }

    &._underline {
        &:after {
            content: '';
            position: absolute;
            bottom: 0;
            left: 0;
            width: 100%;
            height: 0.2rem;
            background: var(--bricks-primary);
            transform: scaleX(0);
            transform-origin: left center;
            transition: transform var(--bricks-default-transition);
        }

        &._selected:after {
            transform: scaleX(1);
        }
    }
}

.tooltip {
    display: inline-flex;
}
</style>
