<script setup lang="ts">
// #region Imports
// Types
import type { IBlockSectionProps } from '../types/blockProps';

// Vue
import { computed, ref, inject, useCssModule, type CSSProperties, type Ref, type Slot } from 'vue';

// Composables
import { useLayoutDropZone } from '../composables/useLayoutDropZone';
// #endregion

// #region Props
const props = withDefaults(defineProps<IBlockSectionProps>(), {});

const slots = defineSlots<{
    default?: Slot;
}>();
// #endregion

// #region Data
const showGrid = inject<Ref<boolean>>('showGrid', ref(true));
const styles = useCssModule();
const sectionRef = ref<HTMLElement | null>(null);
const dropInsertIndex = ref<number | null>(null);
// #endregion

// #region Computed
const isEmpty = computed(() => {
    return !slots.default?.();
});

const sectionStyle = computed<CSSProperties>(() => {
    const lp = props.layoutProps;
    const style: CSSProperties = {
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        position: 'relative',
        pointerEvents: 'auto',
    };

    const paddingTop = Math.round(Math.max(0, Number(lp.paddingTop) || 0) * 10) / 10;
    const paddingBottom = Math.round(Math.max(0, Number(lp.paddingBottom) || 0) * 10) / 10;
    const paddingX = Math.round(Math.max(0, Number(lp.paddingX) || 0) * 10) / 10;

    style.padding = `${paddingTop}rem ${paddingX}rem ${paddingBottom}rem`;

    if (lp.backgroundColor) {
        style.backgroundColor = lp.backgroundColor;
    }

    if (lp.backgroundImage) {
        style.backgroundImage = `url(${lp.backgroundImage})`;
        style.backgroundSize = 'cover';
        style.backgroundPosition = 'center';
    }

    const borderRadius = Math.round(Math.max(0, Number(lp.borderRadius) || 0) * 10) / 10;
    if (borderRadius > 0) {
        style.borderRadius = `${borderRadius}rem`;
    }

    const minHeight = Math.round(Math.max(0, Number(lp.minHeight) || 0) * 10) / 10;
    if (minHeight > 0) {
        style.minHeight = `${minHeight}rem`;
    } else {
        style.minHeight = '10rem';
    }

    return style;
});

// #endregion

// #region Methods
/**
 * Сбрасывает вычисленный индекс flow-плейсхолдера.
 */
function clearDropTarget(): void {
    dropInsertIndex.value = null;
}

/**
 * Вычисляет индекс flow-плейсхолдера по вертикальной позиции курсора.
 *
 * @param event - Текущее dragover-событие.
 */
function updateDropTarget(event: DragEvent): void {
    const container = sectionRef.value;
    if (!container) {
        return;
    }

    const children = Array.from(
        container.querySelectorAll<HTMLElement>(':scope > [data-layout-drop-item="true"]')
    );

    const pointerPosition = event.clientY;

    if (children.length === 0) {
        dropInsertIndex.value = 0;
        return;
    }

    let targetIndex = children.length;

    children.some((child, index) => {
        const childRect = child.getBoundingClientRect();
        const mid = childRect.top + (childRect.bottom - childRect.top) / 2;

        if (pointerPosition < mid) {
            targetIndex = index;
            return true;
        }
        return false;
    });

    dropInsertIndex.value = targetIndex;
}
// #endregion

// #region Drop zone
const {
    isDragOver,
    isCanvasDragActive,
    handleDragEnter,
    handleDragOver,
    handleDragLeave,
    handleDrop,
} = useLayoutDropZone({
    containerRef: sectionRef,
    layoutId: () => props.layoutId,
    useDragDepth: true,
    onDragMove: updateDropTarget,
    onReset: clearDropTarget,
    resolveDropIndex: () => dropInsertIndex.value,
    placeholderClass: styles.dropPlaceholder,
});
// #endregion
</script>

<template>
    <div
        ref="sectionRef"
        :class="[
            $style.BlockSection,
            { [$style.dragOver]: isDragOver, [$style.gridHidden]: !showGrid },
        ]"
        :style="sectionStyle"
        data-layout-drop-zone="true"
        :data-layout-id="layoutId ?? null"
        @dragenter="handleDragEnter"
        @dragover="handleDragOver"
        @dragleave="handleDragLeave"
        @drop="handleDrop"
    >
        <!-- Content -->
        <slot />

        <!-- Drop placeholder when empty -->
        <div
            v-if="isEmpty && !isCanvasDragActive"
            :class="$style.emptyPlaceholder"
            data-layout-drop-placeholder="true"
        >
            Drop components here
        </div>
    </div>
</template>

<style module lang="scss">
.BlockSection {
    position: relative;
    min-width: 0;
    border: 1px dashed var(--bricks-base-300);
    background-color: var(--bricks-base-50);
    transition:
        border-color var(--bricks-default-transition),
        background-color var(--bricks-default-transition),
        box-shadow var(--bricks-default-transition);

    > :global([data-layout-drop-item='true']) {
        min-width: 0;
    }

    // Кольцо hover/выделения рисует BuilderCanvasItem — здесь только подсветка зоны.
    &:hover {
        border-color: var(--bricks-primary);
        background-color: color-mix(in srgb, var(--bricks-primary) 6%, var(--bricks-base-50));
    }

    &.dragOver[data-layout-drop-active='true'] {
        border-color: var(--bricks-primary);
        background-color: color-mix(in srgb, var(--bricks-primary) 6%, var(--bricks-base-50));
        box-shadow: var(--bricks-canvas-ring-active);
    }
}

.gridHidden {
    border-color: transparent;
    background-color: transparent;

    &:hover {
        border-color: transparent;
        box-shadow: none;
    }
}

.emptyPlaceholder {
    padding: 4rem 2rem;
    text-align: center;
    font-size: 1.4rem;
    font-weight: 500;
    color: var(--bricks-base-500);
    pointer-events: none;
}

.dropPlaceholder {
    box-sizing: border-box;
    align-self: stretch;
    flex: none;
    width: var(--bricks-drag-placeholder-flow-width);
    height: var(--bricks-drag-placeholder-height);
    border: 0.2rem dashed var(--bricks-primary);
    background: color-mix(in srgb, var(--bricks-primary) 7%, transparent);
    pointer-events: none;
}
</style>
