<script setup lang="ts">
/**
 * @description Empty state: a glyph, a title, a note and room for an action.
 *
 * The outer spacing is set by the caller through its own class — a dashboard
 * section gives the state `8rem` vertically, a sidebar panel its whole height,
 * and the template grid stretches it with flex. A `padding` of its own would
 * have to be overridden in every other place, and overriding a class with a
 * class would be decided by style order rather than by intent.
 *
 * The canvas empty state does NOT move here: it has an illustration of its own
 * and a hint about dragging, which makes it an invitation to act rather than a
 * report that the list is empty. For the same reason there is no clickable
 * variant here, the way the "add the first item" placeholders in property
 * editors are built.
 *
 * The circle under the glyph belongs to the large size only: in a sidebar panel
 * it takes up a third of the free height and turns the message into a banner.
 * The description has a width ceiling — without it the text stretches across the
 * whole section and reads as a 120-character line.
 */

// #region Imports
// Types
import type { IBricksEmptyStateProps } from './types.d.ts';

// Vue
import { computed, useCssModule } from 'vue';
// #endregion

// #region Props
const props = withDefaults(defineProps<IBricksEmptyStateProps>(), {
    icon: '',
    description: '',
    size: 'md',
});
// #endregion

// #region Data
const $style = useCssModule();
// #endregion

// #region Computed
const rootClasses = computed(() => [$style.BricksEmptyState, $style[`_${props.size}`]]);
// #endregion
</script>

<template>
    <div :class="rootClasses">
        <div v-if="props.icon" :class="$style.iconBox">
            <BricksIcon :icon="props.icon" :class="$style.icon" />
        </div>

        <h2 :class="$style.title">{{ props.title }}</h2>

        <p v-if="props.description" :class="$style.description">{{ props.description }}</p>

        <div v-if="$slots.default" :class="$style.action">
            <slot />
        </div>
    </div>
</template>

<style module lang="scss">
.BricksEmptyState {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-direction: column;
    gap: 0.8rem;
    text-align: center;
}

.iconBox {
    display: flex;
    align-items: center;
    justify-content: center;

    ._md & {
        width: 6.4rem;
        height: 6.4rem;
        margin-bottom: 0.4rem;
        border-radius: 50%;
        background: var(--bricks-base-100);
    }
}

.icon {
    ._md & {
        width: 2.8rem;
        height: 2.8rem;
        font-size: 2.8rem;
        color: var(--bricks-base-400);
    }

    ._sm & {
        width: 4.8rem;
        height: 4.8rem;
        font-size: 4.8rem;
        color: var(--bricks-base-300);
    }
}

.title {
    margin: 0;

    ._md & {
        font-size: 1.6rem;
        font-weight: 700;
        color: var(--bricks-base-900);
    }

    ._sm & {
        font-size: 1.4rem;
        font-weight: 500;
        color: var(--bricks-base-900);
    }
}

.description {
    max-width: 36rem;
    margin: 0;

    ._md & {
        font-size: 1.4rem;
        color: var(--bricks-base-500);
    }

    ._sm & {
        font-size: 1.2rem;
        color: var(--bricks-base-500);
    }
}

.action {
    margin-top: 0.8rem;
}
</style>
