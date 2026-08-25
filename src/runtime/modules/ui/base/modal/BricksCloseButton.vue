<script setup lang="ts">
/**
 * @description Modal close button: icon only, no text.
 *
 * The component gives itself its accessible name. An icon forms no name, and
 * without one a screen reader announces the button as just "button" — the only
 * way out of the window ends up nameless. The name is generic ("Close") because
 * that is what describes the action: what exactly the button closes is told to a
 * person by the title of the window it stands in.
 *
 * The name can be overridden from the outside with a plain `aria-label`:
 * attribute inheritance is on for the component, and an outer value replaces the
 * inner one. That is needed where windows nest several levels deep and "Close"
 * stops being unambiguous.
 *
 * The look is an exact implementation of the Figma Close Button node (174:190):
 * `surface-raised` background, `0.8rem` radius, `base-600` icon, no border.
 */

// #region Imports
// Types
import type { IBricksCloseButtonEmits, IBricksCloseButtonProps } from './types.d.ts';

// Vue
import { useI18n } from 'vue-i18n';
// #endregion

// #region Props
const props = withDefaults(defineProps<IBricksCloseButtonProps>(), {
    disabled: false,
});
// #endregion

// #region Emits
const emit = defineEmits<IBricksCloseButtonEmits>();
// #endregion

// #region Data
const { t } = useI18n();
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
    <button
        type="button"
        :class="$style.BricksCloseButton"
        :disabled="props.disabled"
        :aria-label="t('bricks.common.close')"
        @click="handleClick"
    >
        <BricksIcon icon="ta:outline-x" />
    </button>
</template>

<style module lang="scss">
.BricksCloseButton {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 3.2rem;
    height: 3.2rem;
    padding: 0;
    border-radius: var(--bricks-border-radius-control);
    border: none;
    background-color: var(--bricks-surface-raised);
    color: var(--bricks-base-600);
    transition:
        color var(--bricks-default-transition),
        background-color var(--bricks-default-transition);
    cursor: pointer;

    &:not(:disabled):hover {
        color: var(--bricks-base-900);
    }

    &:focus-visible {
        outline: none;
        box-shadow: var(--bricks-shadow-focus);
    }

    &:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }

    svg {
        width: 2rem;
        height: 2rem;
    }
}
</style>
