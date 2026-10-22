<script setup lang="ts">
/**
 * @description Collapsible section: a title row with a chevron and the content
 * underneath. The content mounts only when open — sections in this project fetch
 * data (the version list) and hold a file input, so hiding them with the
 * `hidden` attribute would mean keeping all that alive while closed.
 *
 * The state is controlled: three of the four places the section is assembled
 * from open it themselves (routing expands if the page has a prefix set;
 * versions collapse when the page changes), which means the component cannot own
 * openness.
 *
 * `aria-expanded` and `aria-controls` are what none of the copies had: without
 * them a screen reader read the title as an ordinary button and did not report
 * that it expands anything. `aria-controls` is bound only in the open state:
 * while closed there is no content in the markup, and the reference would point
 * into nothing.
 */

// #region Imports
// Types
import type { IBricksDisclosureProps, IBricksDisclosureEmits } from './types.d.ts';

// Vue
import { useId } from 'vue';
// #endregion

// #region Props
const props = withDefaults(defineProps<IBricksDisclosureProps>(), {});
// #endregion

// #region Emits
const emit = defineEmits<IBricksDisclosureEmits>();
// #endregion

// #region Data
/**
 * Content identifier for `aria-controls`. `useId` is the right tool here — it
 * solves exactly the problem of a DOM attribute id that stays stable between
 * server and client (unlike persisted schema ids, where it does not fit).
 */
const contentId = useId();
// #endregion

// #region Methods
/**
 * Asks the owner of the state to flip openness.
 */
function handleToggle(): void {
    emit('update:value', !props.value);
}
// #endregion
</script>

<template>
    <div :class="$style.BricksDisclosure">
        <div :class="$style.head">
            <button
                type="button"
                :class="$style.toggle"
                :aria-expanded="props.value"
                :aria-controls="props.value ? contentId : undefined"
                @click="handleToggle"
            >
                <BricksIcon
                    icon="ta:outline-chevron-right"
                    :class="[$style.caret, props.value && $style._open]"
                />
                {{ props.label }}
            </button>

            <slot name="actions" />
        </div>

        <div v-if="props.value" :id="contentId">
            <slot />
        </div>
    </div>
</template>

<style module lang="scss">
.BricksDisclosure {
    display: flex;
    flex-direction: column;
    gap: 1.2rem;
}

.head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.8rem;
}

.toggle {
    display: flex;
    align-items: center;
    padding: 0;
    border: none;
    background: transparent;
    font-size: 1.2rem;
    font-weight: 500;
    color: var(--bricks-base-600);
    transition: color var(--bricks-default-transition);
    cursor: pointer;
    gap: 0.6rem;

    &:hover {
        color: var(--bricks-base-900);
    }

    &:focus-visible {
        outline: none;
        box-shadow: var(--bricks-shadow-focus);
    }
}

.caret {
    width: 1.2rem;
    height: 1.2rem;
    transition: transform var(--bricks-default-transition);

    &._open {
        transform: rotate(90deg);
    }
}
</style>
