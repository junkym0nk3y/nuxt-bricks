<script setup lang="ts">
/**
 * @description Универсальный компонент кнопки с вариантами оформления и размерами
 */

// #region Imports
// Vue
import { computed, useCssModule } from 'vue';

// Reka UI
import { Primitive } from 'reka-ui';

// Types
import type { IIdaButtonProps, IIdaButtonEmits } from './types.d.ts';
// #endregion

// #region Props
const props = withDefaults(defineProps<IIdaButtonProps>(), {
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
const emit = defineEmits<IIdaButtonEmits>();
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
 * @description Обрабатывает клик по кнопке
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
    border-radius: var(--border-radius-sm);
    border: 0.2rem solid transparent;
    background-color: transparent;
    font-weight: 500;
    line-height: 1.2;
    color: var(--land-base-900);
    transition: var(--default-transition);
    cursor: pointer;
    user-select: none;

    &:focus-visible {
        outline: none;
        box-shadow: var(--shadow-focus);
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
        font-size: 1.2rem;
    }

    &._md {
        min-height: 3.6rem;
        padding: 1rem 1.6rem;
        font-size: 1.4rem;
    }

    &._lg {
        min-height: 4rem;
        padding: 1.2rem 2rem;
        font-size: 1.6rem;
    }

    &._primary {
        border-color: var(--land-primary);
        background-color: var(--land-primary);
        color: var(--land-base-0);

        &:not(._disabled):hover {
            border-color: var(--land-primary);
            background-color: var(--land-primary);
        }
    }

    &._secondary {
        border-color: var(--land-base-400);
        background-color: var(--land-base-0);
        color: var(--land-base-900);

        &:not(._disabled):hover {
            border-color: var(--land-primary);
        }

        &._active {
            border-color: var(--land-primary);
            color: var(--land-primary);
        }
    }

    &._ghost {
        border-color: transparent;
        background-color: transparent;
        color: var(--land-base-600);

        &:not(._disabled):hover {
            border-color: var(--land-base-300);
            background-color: var(--land-base-300);
        }
    }

    &._danger {
        border-color: var(--land-danger-600);
        background-color: var(--land-danger-500);
        color: var(--land-base-0);

        &:not(._disabled):hover {
            border-color: var(--land-danger-600);
            background-color: var(--land-danger-600);
        }
    }

    &._outline {
        border-color: var(--land-base-300);
        background-color: var(--land-base-0);
        color: var(--land-base-600);

        &:not(._disabled):hover {
            border-color: var(--land-base-300);
            background-color: var(--land-base-300);
        }
    }

    &._active {
        border-color: var(--land-primary);
        color: var(--land-primary);
    }

    &._red {
        border-color: var(--land-danger-600);
        background-color: var(--land-danger-600);
        color: var(--land-base-0);

        &:not(._disabled):hover {
            border-color: var(--land-danger-600);
            background-color: var(--land-danger-600);
        }
    }

    &._green {
        border-color: var(--land-green);
        background-color: var(--land-green);
        color: var(--land-base-0);

        &:not(._disabled):hover {
            border-color: var(--land-green);
            background-color: var(--land-green);
        }
    }

    &._yellow {
        border-color: var(--land-yellow);
        background-color: var(--land-yellow);
        color: var(--land-base-0);

        &:not(._disabled):hover {
            border-color: var(--land-yellow);
            background-color: var(--land-yellow);
        }
    }

    &._grey {
        border-color: var(--land-base-900);
        background-color: var(--land-base-900);
        color: var(--land-base-0);

        &:not(._disabled):hover {
            border-color: var(--land-base-900);
            background-color: var(--land-base-900);
        }
    }

    // Modifiers from new_ui
    &._round {
        border-radius: 100%;
    }

    &._equal {
        &._sm {
            padding: 0.8rem;
        }

        &._md {
            padding: 1rem;
        }

        &._lg {
            padding: 1.2rem;
        }
    }

    &._fill {
        color: var(--land-primary);
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
