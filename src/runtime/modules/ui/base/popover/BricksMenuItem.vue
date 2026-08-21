<script setup lang="ts">
/**
 * @description Menu row inside `BricksPopoverSurface`: a glyph, a caption and an
 * optional value on the right.
 *
 * The hover background is `base-50` for all of them: before the component was
 * extracted, one and the same role turned up with `base-50`, `base-100` and
 * `surface-raised` — and the last two are the same color under different names.
 *
 * The root is a `button` rather than a `div`: an item always does something, and
 * as a button it joins the keyboard tab order without a hand-written `tabindex`.
 * With reka items it is composed through `as-child` — then `role="menuitem"` and
 * the selection handler land on this same button. The hover style also covers
 * `data-highlighted`, which reka sets while walking the menu with the keyboard;
 * without it the keyboard walk would not be visible at all.
 *
 * The canvas context menu is NOT moved onto this component: it has a hover look
 * of its own (a `primary` fill with a white caption, like system context menus),
 * and reducing it to the neutral one would mean changing the design rather than
 * removing a duplicate.
 */

// #region Imports
// Types
import type { IBricksMenuItemProps, IBricksMenuItemEmits } from './types.d.ts';

// Vue
import { computed, useCssModule } from 'vue';
// #endregion

// #region Props
const props = withDefaults(defineProps<IBricksMenuItemProps>(), {
    icon: '',
    hint: '',
    active: false,
    disabled: false,
    danger: false,
});
// #endregion

// #region Emits
const emit = defineEmits<IBricksMenuItemEmits>();
// #endregion

// #region Data
const $style = useCssModule();
// #endregion

// #region Computed
const rootClasses = computed(() => [
    $style.BricksMenuItem,
    {
        [$style._active]: props.active,
        [$style._danger]: props.danger,
    },
]);
// #endregion

// #region Methods
/**
 * Passes the click outwards.
 *
 * @param event - MouseEvent.
 */
function handleClick(event: MouseEvent): void {
    emit('click', event);
}
// #endregion
</script>

<template>
    <button type="button" :class="rootClasses" :disabled="props.disabled" @click="handleClick">
        <BricksIcon v-if="props.icon" :icon="props.icon" :class="$style.icon" />

        <span :class="$style.label">{{ props.label }}</span>

        <span v-if="props.hint" :class="$style.hint">{{ props.hint }}</span>
    </button>
</template>

<style module lang="scss">
.BricksMenuItem {
    display: flex;
    align-items: center;
    width: 100%;
    min-height: 3.6rem;
    padding: 0 0.8rem;
    border-radius: var(--bricks-border-radius-xs);
    border: none;
    background: transparent;
    font-size: 1.4rem;
    color: var(--bricks-base-700);
    transition:
        background-color var(--bricks-default-transition),
        color var(--bricks-default-transition);
    cursor: pointer;
    gap: 0.8rem;

    &:hover,
    &[data-highlighted] {
        background: var(--bricks-base-50);
        outline: none;
        color: var(--bricks-base-900);
    }

    &._active {
        color: var(--bricks-primary-600);

        .icon {
            color: var(--bricks-primary-500);
        }
    }

    &._danger {
        color: var(--bricks-danger-500);

        .icon {
            color: var(--bricks-danger-500);
        }
    }

    &:disabled {
        color: var(--bricks-base-400);
        cursor: not-allowed;

        .icon {
            color: var(--bricks-base-300);
        }
    }
}

.icon {
    flex-shrink: 0;
    width: 1.8rem;
    height: 1.8rem;
    font-size: 1.8rem;
    color: var(--bricks-base-500);
}

.label {
    overflow: hidden;
    flex: 1;
    text-align: left;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.hint {
    flex-shrink: 0;
    font-size: 1.2rem;
    color: var(--bricks-base-500);
}
</style>
