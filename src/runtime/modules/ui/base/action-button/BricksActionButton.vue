<script setup lang="ts">
// #region Imports
// Types
import type { ILandUiCommonProp } from './types.d.ts';

// Vue
import { computed, ref, useCssModule } from 'vue';

// Reka UI
import {
    DropdownMenuRoot,
    DropdownMenuTrigger,
    DropdownMenuPortal,
    DropdownMenuContent,
    DropdownMenuItem,
} from 'reka-ui';

// Components
import BricksButton from '../button/BricksButton.vue';
import BricksSelectOption from '../../inputs/BricksSelectOption.vue';
// #endregion

// #region Props
const props = withDefaults(
    defineProps<{
        disabled?: boolean;
        isSubmitting?: boolean;
        options: ILandUiCommonProp[];
    }>(),
    {
        disabled: false,
        isSubmitting: false,
    }
);
// #endregion

// #region Emits
const emit = defineEmits<{
    saveAsCopy: [];
    publish: [];
    saveDraft: [];
}>();
// #endregion

// #region Data
const $style = useCssModule();
const isOpened = ref(false);
// #endregion

// #region Computed
const isDisabled = computed(() => props.disabled || props.isSubmitting);

const menuClasses = computed(() => ({
    [$style._opened]: isOpened.value,
    [$style._disabled]: isDisabled.value,
}));

const resolvedOptions = computed(() => props.options ?? []);
// #endregion

// #region Methods
/**
 * Handles option select, emits matching action. Reka closes the menu itself.
 *
 * @param option - Selected option metadata.
 */
function handleOptionSelect(option: ILandUiCommonProp): void {
    switch (option.value) {
        case 'copy':
            emit('saveAsCopy');
            break;
        case 'publish':
            emit('publish');
            break;
        case 'draft':
            emit('saveDraft');
            break;
        default:
            break;
    }
}
// #endregion
</script>

<template>
    <DropdownMenuRoot v-model:open="isOpened">
        <div :class="[$style.BricksActionButton, menuClasses]">
            <DropdownMenuTrigger as-child :disabled="isDisabled">
                <BricksButton
                    :class="$style.actionButton"
                    size="md"
                    variant="primary"
                    :disabled="isDisabled"
                >
                    <slot />
                </BricksButton>
            </DropdownMenuTrigger>

            <DropdownMenuPortal>
                <DropdownMenuContent
                    :class="$style.dropdown"
                    align="end"
                    :side-offset="4"
                    position="popper"
                >
                    <div :class="$style.optionsWrapper">
                        <DropdownMenuItem
                            v-for="option in resolvedOptions"
                            :key="String(option.value)"
                            as-child
                            @select="handleOptionSelect(option)"
                        >
                            <BricksSelectOption :spec="option" value="" :class="$style.option" />
                        </DropdownMenuItem>
                    </div>
                </DropdownMenuContent>
            </DropdownMenuPortal>
        </div>
    </DropdownMenuRoot>
</template>

<style module lang="scss">
.BricksActionButton {
    position: relative;
    display: inline-flex;
    align-items: stretch;

    .actionButton {
        padding-right: 3.2rem;
    }

    &:after {
        content: '';
        position: absolute;
        top: 50%;
        right: 1.6rem;
        width: 0;
        height: 0;
        border: 0.4rem solid transparent;
        border-top-color: var(--land-base-0);
        transform: translateY(-25%);
        transition:
            transform 150ms ease,
            color 150ms ease;
        pointer-events: none;
    }

    &._opened:after {
        transform: translateY(-75%) rotate(180deg);
    }

    &._disabled {
        pointer-events: none;
        opacity: 0.6;
    }
}

.dropdown {
    z-index: 20;
    min-width: 22rem;
    padding: 0.8rem;
    border-radius: var(--border-radius-sm);
    border: 1px solid var(--land-base-200);
    background-color: var(--land-base-0);
    box-shadow: var(--shadow-md);

    &[data-state='open'] {
        animation: dropdown-in 0.2s ease;
    }
}

.optionsWrapper {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
}

.option {
    width: 100%;
    outline: none;

    &[data-highlighted] {
        border-radius: var(--border-radius-sm);
        background-color: var(--land-base-300);
    }
}

@keyframes dropdown-in {
    from {
        opacity: 0;
        transform: translateY(-0.4rem);
    }

    to {
        opacity: 1;
        transform: translateY(0);
    }
}
</style>
