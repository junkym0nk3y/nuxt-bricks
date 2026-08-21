<script setup lang="ts">
/**
 * @description Generic button component with looks and sizes.
 *
 * The `quiet` look is the same raised tile as `secondary`, but with the caption
 * and the glyph muted down to `base-500` — a panel tool must not compete with the
 * "Save" next to it. Its earlier name, `outline`, was left over from the bordered
 * look that preceded soft-UI and lied: the variant has no border, while
 * `outlined` on `BricksIconButton` does draw one.
 *
 * The pressed-toggle ring lists its variants deliberately. On `primary` and
 * `danger` that rule would paint the glyph `primary` over a `primary` or `danger`
 * fill — the glyph would disappear against its own background. `ghost` has a
 * pressed look of its own (a `primary` fill with a white glyph).
 *
 * A square button (`equal`) is set by its side rather than by padding around the
 * icon. Padding made the width depend on the glyph font size, and the icon
 * inherits that size from the button: a place that had not given the icon a size
 * of its own got a `1.2rem` glyph and a 2.6×3.2 button instead of a square — that
 * is how the whole media gallery drifted away from the rest of the builder
 * (32×32 with a `1.8rem` glyph). The font size therefore lives here too:
 * otherwise "squareness" rests on every caller remembering an icon class of its
 * own. An explicit class at the caller still overrides this value.
 */

// #region Imports
// Vue
import { computed, useCssModule } from 'vue';

// Reka UI
import { Primitive } from 'reka-ui';

// Types
import type { IBricksButtonProps, IBricksButtonEmits } from './types.d.ts';
// #endregion

// #region Props
const props = withDefaults(defineProps<IBricksButtonProps>(), {
    variant: 'secondary',
    size: 'md',
    disabled: false,
    block: false,
    active: false,
    type: 'button',
    round: false,
    fill: false,
    equal: false,
});
// #endregion

// #region Emits
const emit = defineEmits<IBricksButtonEmits>();
// #endregion

// #region Data
const $style = useCssModule();
// #endregion

// #region Computed
const classList = computed(() => ({
    [$style[`_${props.variant}`]]: Boolean(props.variant),
    [$style[`_${props.size}`]]: Boolean(props.size),
    [$style._block]: props.block,
    [$style._active]: props.active,
    [$style._disabled]: props.disabled,
    [$style._round]: props.round,
    [$style._fill]: props.fill,
    [$style._equal]: props.equal,
}));
// #endregion

// #region Methods
/**
 * @description Handles a click on the button
 */
function onClick(event: MouseEvent): void {
    if (props.disabled) {
        return;
    }

    emit('click', event);
}
// #endregion
</script>

<template>
    <Primitive
        as="button"
        :class="[$style.button, classList]"
        :disabled="props.disabled"
        :type="props.type"
        @click="onClick"
    >
        <span :class="$style.content">
            <slot />
        </span>
    </Primitive>
</template>

<style module lang="scss">
.button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--bricks-border-radius-sm);
    border: 1px solid transparent;
    background-color: transparent;
    font-weight: 500;
    line-height: 1.2;
    color: var(--bricks-base-900);
    transition: var(--bricks-default-transition);
    cursor: pointer;
    user-select: none;

    &:focus-visible {
        outline: none;
        box-shadow: var(--bricks-shadow-focus);
    }

    &._disabled {
        pointer-events: none;
        opacity: 0.6;
        box-shadow: none;
    }

    &._block {
        width: 100%;
    }

    &._sm {
        min-height: 3.2rem;
        padding: 0 1.2rem;
        font-size: var(--bricks-font-size-sm);
    }

    &._md {
        min-height: 3.6rem;
        padding: 1rem 1.6rem;
        font-size: var(--bricks-font-size-base);
    }

    &._lg {
        min-height: 4rem;
        padding: 1.2rem 2rem;
        font-size: var(--bricks-font-size-lg);
    }

    &._primary {
        border-color: transparent;
        background-color: var(--bricks-primary);
        box-shadow: var(--bricks-shadow-sm);
        color: var(--bricks-static-white);

        &:not(._disabled):hover {
            background-color: var(--bricks-primary-600);
        }

        &:focus-visible {
            box-shadow: var(--bricks-shadow-focus);
        }
    }

    &._secondary {
        border-color: transparent;
        background-color: var(--bricks-surface-raised);
        color: var(--bricks-base-900);

        &:not(._disabled):hover {
            background-color: var(--bricks-base-200);
        }

        &._active {
            color: var(--bricks-primary);
        }
    }

    &._ghost {
        border-color: transparent;
        background-color: transparent;
        color: var(--bricks-base-600);

        &:not(._disabled):hover {
            background-color: var(--bricks-surface-raised);
            color: var(--bricks-base-900);
        }

        &._active {
            border-color: transparent;
            background-color: var(--bricks-primary);
            color: var(--bricks-static-white);

            &:not(._disabled):hover {
                background-color: var(--bricks-primary);
                color: var(--bricks-static-white);
            }
        }
    }

    &._danger {
        border-color: transparent;
        background-color: var(--bricks-danger-500);
        box-shadow: var(--bricks-shadow-sm);
        color: var(--bricks-static-white);

        &:not(._disabled):hover {
            background-color: var(--bricks-danger-600);
        }

        &:focus-visible {
            box-shadow: var(--bricks-shadow-focus);
        }
    }

    &._quiet {
        border-color: transparent;
        background-color: var(--bricks-surface-raised);
        color: var(--bricks-base-500);

        &:not(._disabled):hover {
            color: var(--bricks-base-900);
        }
    }

    &._secondary._active,
    &._quiet._active {
        border-color: var(--bricks-primary);
        color: var(--bricks-primary);
    }

    &._red {
        border-color: transparent;
        background-color: var(--bricks-danger-600);
        box-shadow: var(--bricks-shadow-sm);
        color: var(--bricks-static-white);
    }

    &._green {
        border-color: transparent;
        background-color: var(--bricks-green);
        box-shadow: var(--bricks-shadow-sm);
        color: var(--bricks-static-white);
    }

    &._yellow {
        border-color: transparent;
        background-color: var(--bricks-yellow);
        box-shadow: var(--bricks-shadow-sm);
        color: var(--bricks-static-white);
    }

    &._grey {
        border-color: transparent;
        background-color: var(--bricks-base-900);
        box-shadow: var(--bricks-shadow-sm);
        color: var(--bricks-static-white);
    }

    &._round {
        border-radius: 100%;
    }

    &._equal {
        padding: 0;

        &._sm {
            width: 3.2rem;
            height: 3.2rem;
            font-size: 1.8rem;
        }

        &._md {
            width: 4rem;
            height: 4rem;
            font-size: 1.8rem;
        }

        &._lg {
            width: 4.4rem;
            height: 4.4rem;
            font-size: 2rem;
        }
    }

    &._fill {
        color: var(--bricks-primary);
    }
}

.content {
    display: inline-flex;
    gap: 0.8rem;
    justify-content: center;

    svg {
        width: auto;
        height: auto;
    }
}
</style>
