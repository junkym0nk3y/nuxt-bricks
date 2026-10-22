<script setup lang="ts">
/**
 * @description Preview close button on a published page.
 *
 * A self-contained copy of `ui/base/modal/BricksCloseButton`: `render` never
 * imports `ui`, or the whole kit would be pulled into the published page bundle
 * for the sake of a single button. The copy is deliberate, but it has drifted
 * once already — radius `md` with a border where the original had `control` and
 * none, hover changing the background instead of the glyph color, and no focus
 * ring at all — so `test/render/rendererCloseButtonParity.spec.ts` now watches
 * the tokens. The style values below are exactly `BricksCloseButton`'s, because
 * the copy has to read as the same control the builder shows: change both files
 * or neither.
 *
 * The accessible name comes from the outside: `render` has no locales, and a
 * baked-in string would serve exactly one language. A name is required at all
 * because the button holds nothing but an icon and stands next to no text a
 * screen reader could borrow meaning from. The single call site — the preview
 * banner — supplies it.
 */

// #region Imports
// Types
import type { IRendererCloseButtonEmits, IRendererCloseButtonProps } from '../types/render';
// #endregion

// #region Props
const props = withDefaults(defineProps<IRendererCloseButtonProps>(), {
    disabled: false,
});
// #endregion

// #region Emits
const emit = defineEmits<IRendererCloseButtonEmits>();
// #endregion

// #region Methods
/**
 * Forwards the click outward.
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
        :class="$style.RendererCloseButton"
        :disabled="props.disabled"
        @click="handleClick"
    >
        <BricksIcon icon="ta:outline-x" />
    </button>
</template>

<style module lang="scss">
.RendererCloseButton {
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
