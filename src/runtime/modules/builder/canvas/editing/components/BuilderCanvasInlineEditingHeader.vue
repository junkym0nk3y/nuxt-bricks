<script setup lang="ts">
// #region Imports
// Types
import type { IInlineEditingHeaderProps, IInlineEditingHeaderEmits } from '../../types/components';
// #endregion

// #region Props
const props = withDefaults(defineProps<IInlineEditingHeaderProps>(), {});
// #endregion

// #region Emits
const emit = defineEmits<IInlineEditingHeaderEmits>();
// #endregion

// #region Methods
/** Переключает на предыдущее свойство. */
function handleSwitchPrev(): void {
    emit('switch-prev');
}

/** Переключает на следующее свойство. */
function handleSwitchNext(): void {
    emit('switch-next');
}
// #endregion
</script>

<template>
    <div :class="$style.BuilderCanvasInlineEditingHeader">
        <div :class="$style.inlineEditTitle">
            {{ props.propLabel }}
        </div>

        <div v-if="props.editablePropsCount > 1" :class="$style.propSwitcher">
            <button
                :disabled="!props.canSwitchPrev"
                :class="$style.switchButton"
                @mousedown.prevent
                @click="handleSwitchPrev"
            >
                <svg
                    width="12"
                    height="12"
                    viewBox="0 0 12 12"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.5"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                >
                    <path d="M7.5 9L4.5 6L7.5 3" />
                </svg>
            </button>
            <span :class="$style.propCounter">
                {{ props.currentPropIndex + 1 }}/{{ props.editablePropsCount }}
            </span>
            <button
                :disabled="!props.canSwitchNext"
                :class="$style.switchButton"
                @mousedown.prevent
                @click="handleSwitchNext"
            >
                <svg
                    width="12"
                    height="12"
                    viewBox="0 0 12 12"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.5"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                >
                    <path d="M4.5 3L7.5 6L4.5 9" />
                </svg>
            </button>
        </div>
    </div>
</template>

<style module lang="scss">
.BuilderCanvasInlineEditingHeader {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.6rem;
}

.inlineEditTitle {
    text-align: center;
    font-size: 1.2rem;
    user-select: none;
}

.propSwitcher {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.4rem;
}

.switchButton {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 2rem;
    height: 2rem;
    border-radius: var(--border-radius-xs);
    border: none;
    background: transparent;
    color: var(--bricks-base-600);
    cursor: pointer;

    &:hover:not(:disabled) {
        background: var(--bricks-base-100);
        color: var(--bricks-base-900);
    }

    &:disabled {
        opacity: 0.3;
        cursor: default;
    }
}

.propCounter {
    white-space: nowrap;
    font-size: 1.2rem;
    color: var(--bricks-base-500);
    user-select: none;
}
</style>
