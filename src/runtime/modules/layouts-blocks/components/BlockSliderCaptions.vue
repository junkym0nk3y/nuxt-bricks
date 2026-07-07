<script setup lang="ts">
// #region Imports
// Types
import type { IBlockSliderCaptionsProps, IBlockSliderCaptionsEmits } from '../types/blockProps';
// #endregion

// #region Props
const props = withDefaults(defineProps<IBlockSliderCaptionsProps>(), {});
// #endregion

// #region Emits
const emit = defineEmits<IBlockSliderCaptionsEmits>();
// #endregion

// #region Methods
/**
 * Эмитит выбор слайда по клику на подпись.
 */
function handleCaptionClick(index: number): void {
    emit('select', index);
}
// #endregion
</script>

<template>
    <div :class="$style.BlockSliderCaptions">
        <button
            v-for="(caption, index) in props.captions"
            :key="index"
            :class="[$style.captionTab, { [$style.captionTabActive]: props.activeIndex === index }]"
            type="button"
            @mousedown.prevent
            @click="handleCaptionClick(index)"
        >
            <span :class="$style.captionText">{{ caption.text }}</span>
            <span v-if="caption.subtitle" :class="$style.captionSubtitle">
                {{ caption.subtitle }}
            </span>
        </button>
    </div>
</template>

<style module lang="scss">
.BlockSliderCaptions {
    overflow-x: auto;
    display: flex;
    padding: 0 0.4rem;
    gap: 0.8rem;
    scrollbar-width: none;

    &::-webkit-scrollbar {
        display: none;
    }
}

.captionTab {
    display: flex;
    padding: 0.8rem 1.6rem;
    border-radius: 0.8rem;
    border: 1px solid var(--bricks-base-200);
    background: var(--bricks-base-0);
    white-space: nowrap;
    transition: all 200ms ease;
    cursor: pointer;
    flex-direction: column;
    gap: 0.2rem;

    &:hover {
        border-color: var(--bricks-base-300);
        background: var(--bricks-base-50);
    }
}

.captionTabActive {
    border-color: var(--bricks-primary-500);
    background: var(--bricks-primary-50);
}

.captionText {
    text-transform: uppercase;
    font-size: 1.2rem;
    font-weight: 600;
    letter-spacing: 0.05rem;
    color: var(--bricks-base-600);

    .captionTabActive & {
        color: var(--bricks-primary-500);
    }
}

.captionSubtitle {
    font-size: 1.2rem;
    font-weight: 400;
    color: var(--bricks-base-500);
}
</style>
