<script setup lang="ts">
/**
 * @description Modal header: the title, an optional caption under it, an actions
 * slot and the close button.
 *
 * The component does not take the title as a prop but reads it from
 * `BricksModal` through a provide. The reason is not convenience: the same value
 * goes into the hidden `DialogTitle`, that is into the dialog's name for a screen
 * reader, and while the visible title was written by hand in the template those
 * two strings were two sources of truth and could drift apart silently.
 *
 * There is no separate `size` per case: two steps (`md` for dialogs and forms,
 * `lg` for full-screen working modals) replace the seven paddings and four title
 * sizes that had piled up while the header was rewritten in every modal.
 *
 * The title text sits in a node of its own rather than directly in the heading: a
 * long title (a login in the password form) is cut off with an ellipsis, and
 * next to it there is sometimes a badge with a counter — without a separate node
 * the truncation would eat that too. The header itself does not shrink: in
 * modals with a limited height the body scrolls, and without that the header
 * would give away its padding to it. The title group carries `min-width: 0`,
 * otherwise it does not let the heading shrink and the ellipsis never appears.
 */

// #region Imports
// Types
import type { IBricksModalHeaderProps, IBricksModalHeaderEmits } from './types.d.ts';

// Constants
import { BRICKS_MODAL_TITLE_KEY } from '../../../common/constants/injectionKeys';

// Vue
import { computed, inject, useCssModule } from 'vue';

// Components
import BricksCloseButton from './BricksCloseButton.vue';
// #endregion

// #region Props
const props = withDefaults(defineProps<IBricksModalHeaderProps>(), {
    size: 'md',
    bordered: true,
    closeDisabled: false,
});
// #endregion

// #region Emits
const emit = defineEmits<IBricksModalHeaderEmits>();
// #endregion

// #region Data
const $style = useCssModule();

/**
 * Title of the open modal. The provider is missing only if the header has been
 * placed outside `BricksModal` — outside a modal it has neither a meaning nor a
 * close button that closes anything.
 */
const injectedTitle = inject(BRICKS_MODAL_TITLE_KEY, null);
// #endregion

// #region Computed
const title = computed<string>(() => injectedTitle?.value ?? '');

const rootClasses = computed(() => [
    $style.BricksModalHeader,
    $style[`_${props.size}`],
    { [$style._bordered]: props.bordered },
]);
// #endregion
</script>

<template>
    <div :class="rootClasses">
        <div :class="$style.titleGroup">
            <h2 :class="$style.title">
                <span :class="$style.titleText">{{ title }}</span>
                <slot name="titleExtra" />
            </h2>

            <p v-if="$slots.subtitle" :class="$style.subtitle">
                <slot name="subtitle" />
            </p>
        </div>

        <div :class="$style.actions">
            <slot name="actions" />

            <BricksCloseButton :disabled="props.closeDisabled" @click="emit('close')" />
        </div>
    </div>
</template>

<style module lang="scss">
.BricksModalHeader {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-shrink: 0;
    gap: 1.6rem;

    &._md {
        padding: 1.6rem 2rem;
    }

    &._lg {
        padding: 2rem 2.4rem;
    }

    &._bordered {
        border-bottom: 1px solid var(--bricks-base-200);
    }
}

.titleGroup {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    min-width: 0;
}

.title {
    display: flex;
    align-items: center;
    min-width: 0;
    margin: 0;
    gap: 0.8rem;
    color: var(--bricks-base-900);

    ._md & {
        font-size: 1.6rem;
        font-weight: 600;
    }

    ._lg & {
        font-size: 2rem;
        font-weight: 600;
    }
}

.titleText {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.subtitle {
    margin: 0;
    font-size: 1.2rem;
    color: var(--bricks-base-500);
}

.actions {
    display: flex;
    align-items: center;
    flex-shrink: 0;
    gap: 0.8rem;
}
</style>
