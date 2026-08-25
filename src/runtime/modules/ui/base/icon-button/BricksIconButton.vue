<script setup lang="ts">
/**
 * @description Action button made of a single glyph: a square with an icon and a
 * tooltip.
 *
 * The tooltip here is not decoration but the only way to learn what the button
 * does: a row of identical squares without captions reads neither by eye nor by
 * screen reader. That is why the caption is a required prop rather than an
 * attribute — it cannot be forgotten, the type will not allow it. It also becomes
 * the accessible name: the tooltip content goes off into a portal and never
 * becomes the button's name.
 *
 * The component deliberately does not set a native `title`: next to a real
 * tooltip it gives a second hint on top of the first, with its own delay and its
 * own styling.
 *
 * There are two kinds of blocking, and that is not duplication. `disabled` is the
 * plain block: the button leaves the keyboard tab order. `muted` is a block whose
 * reason a person has to read: the button stays focusable, is announced through
 * `aria-disabled`, and the handler swallows the click. A `disabled` button would
 * carry the reason out of the tab order along with itself, and on an operation
 * that applies immediately it would also lose focus mid-request — the browser
 * takes focus off a button being disabled, and the person ends up at the top of
 * the page.
 *
 * Outer attributes, `class` included, go to the tooltip WRAPPER rather than to
 * the button: it is the wrapper that stands in the flow and gets positioned from
 * the outside. It also serves as the tooltip trigger — which is why the hint
 * shows even over a `disabled` button, which produces no pointer events. That is
 * also why the place in the tab order is a prop: a `tabindex` written from the
 * outside would land on the wrapper, which takes no focus, and the button would
 * keep its own place in the order regardless.
 *
 * Two style decisions the CSS no longer explains: the size sets the font size
 * too, because the glyph inherits `font-size` from the button and without an
 * explicit value its size would depend on the surrounding text (the same trap
 * that made `BricksButton` spell the font size out inside `_equal`); and hover
 * together with "pressed" live under a shared block — nothing changes on a
 * blocked button — with `._active` placed AFTER `:hover` at equal specificity, so
 * hovering a pressed toggle does not reset the pressed look.
 */

// #region Imports
// Types
import type { IBricksIconButtonProps, IBricksIconButtonEmits } from './types.d.ts';

// Vue
import { computed, useCssModule } from 'vue';

// Components
import BricksTooltip from '../tooltip/BricksTooltip.vue';
import BricksTooltipHint from '../tooltip/BricksTooltipHint.vue';
// #endregion

// #region Props
const props = withDefaults(defineProps<IBricksIconButtonProps>(), {
    hint: '',
    // An explicit `undefined` blocks boolean coercion: without it a missing prop
    // would become `false`, and `aria-pressed` would announce every ordinary
    // action as a toggle
    active: undefined,
    // The same trick as for `active`: a missing prop must not become `false` and
    // hang `aria-expanded` on a button that expands nothing
    expanded: undefined,
    variant: 'outlined',
    size: 'md',
    danger: false,
    disabled: false,
    muted: false,
    busy: false,
    tooltipSide: 'bottom',
    // An explicit `undefined` keeps the native tab order: writing `0` here would
    // put every blocked and secondary button back into it
    tabIndex: undefined,
});
// #endregion

// #region Emits
const emit = defineEmits<IBricksIconButtonEmits>();
// #endregion

// #region Data
const $style = useCssModule();
// #endregion

// #region Computed
const classList = computed(() => ({
    [$style[`_${props.variant}`]]: true,
    [$style[`_${props.size}`]]: true,
    [$style._danger]: props.danger,
    [$style._active]: props.active === true,
    [$style._muted]: props.muted,
    [$style._busy]: props.busy,
}));

/**
 * Hint text: the reason for the block if one is given, otherwise the action
 * itself. The accessible name always stays the action — the hint explains why the
 * button does not fire, but does not cancel what it was.
 */
const tooltipText = computed<string>(() => props.hint || props.label);
// #endregion

// #region Methods
/**
 * Passes the click outwards if the button is not blocked.
 *
 * @param event - Click event.
 */
function handleClick(event: MouseEvent): void {
    if (props.disabled || props.muted) {
        return;
    }

    emit('click', event);
}
// #endregion
</script>

<template>
    <BricksTooltip
        :top="props.tooltipSide === 'top'"
        :bottom="props.tooltipSide === 'bottom'"
        :left="props.tooltipSide === 'left'"
        :right="props.tooltipSide === 'right'"
    >
        <template #activator>
            <button
                type="button"
                :class="[$style.BricksIconButton, classList]"
                :disabled="props.disabled"
                :aria-disabled="props.muted || undefined"
                :aria-pressed="props.active"
                :aria-expanded="props.expanded"
                :aria-haspopup="props.expanded === undefined ? undefined : 'dialog'"
                :aria-label="props.label"
                :tabindex="props.tabIndex"
                @click="handleClick"
            >
                <BricksIcon :icon="props.icon" />
            </button>
        </template>

        <BricksTooltipHint :text="tooltipText" />
    </BricksTooltip>
</template>

<style module lang="scss">
.BricksIconButton {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    padding: 0;
    border: 1px solid transparent;
    background: transparent;
    color: var(--bricks-base-500);
    transition:
        color var(--bricks-default-transition),
        border-color var(--bricks-default-transition),
        background-color var(--bricks-default-transition);
    cursor: pointer;

    &:focus-visible {
        outline: none;
        box-shadow: var(--bricks-shadow-focus);
    }

    &._sm {
        width: 2rem;
        height: 2rem;
        font-size: 1.4rem;
    }

    &._md {
        width: 2.8rem;
        height: 2.8rem;
        font-size: 1.4rem;
    }

    &._lg {
        width: 3.2rem;
        height: 3.2rem;
        font-size: 1.6rem;
    }

    &._xl {
        width: 4rem;
        height: 4rem;
        font-size: 1.8rem;
    }

    &._outlined {
        border-radius: var(--bricks-border-radius-xs);
        border-color: var(--bricks-base-200);
        background: var(--bricks-base-0);
    }

    &._ghost {
        border-radius: var(--bricks-border-radius-xs);
    }

    &._quiet {
        border-radius: var(--bricks-border-radius-xs);
        border-color: transparent;
        background: var(--bricks-surface-raised);
    }

    &._overlay {
        border-radius: var(--bricks-border-radius-xs);
        font-size: 1.8rem;
        color: var(--bricks-static-white);
    }

    &:not(:disabled, ._muted) {
        &._outlined:hover {
            border-color: var(--bricks-base-300);
            background: var(--bricks-base-50);
            color: var(--bricks-base-900);
        }

        &._ghost:hover {
            background: var(--bricks-base-100);
            color: var(--bricks-base-700);
        }

        &._quiet:hover {
            color: var(--bricks-base-900);
        }

        &._overlay:hover {
            background: var(--bricks-overlay-light);
        }

        &._outlined._danger:hover {
            border-color: var(--bricks-danger-500);
            background: var(--bricks-danger-50);
            color: var(--bricks-danger-600);
        }

        &._ghost._danger:hover,
        &._quiet._danger:hover,
        &._overlay._danger:hover {
            background: var(--bricks-danger-50);
            color: var(--bricks-danger-500);
        }

        &._active,
        &._active:hover {
            border-color: var(--bricks-primary);
            background: var(--bricks-primary);
            color: var(--bricks-static-white);
        }
    }

    &._danger {
        color: var(--bricks-danger-500);
    }

    &._overlay._danger {
        color: var(--bricks-static-white);
    }

    &:disabled,
    &._muted {
        opacity: 0.5;
        cursor: default;
    }

    &._busy {
        cursor: progress;
    }
}
</style>
