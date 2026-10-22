<script setup lang="ts">
// #region Imports
// Types
import type { IBlockFlexProps } from '../types/blockProps';

// Vue
import { computed, ref, inject, useCssModule, type CSSProperties, type Ref, type Slot } from 'vue';

// Utils
import { convertPxToRem } from '../../common/utils/main';
import { mapFlexAlign, mapFlexJustify } from '../utils/flexAlignment';
import { queryLayoutDropItems, resolveLinearDropIndex } from '../utils/linearDropPlacement';

// Composables
import { useLayoutDropZone } from '../composables/useLayoutDropZone';
// #endregion

// #region Props
const props = withDefaults(defineProps<IBlockFlexProps>(), {});

const slots = defineSlots<{
    default?: Slot;
}>();
// #endregion

// #region Data
const showGrid = inject<Ref<boolean>>('showGrid', ref(true));
const styles = useCssModule();
const flexRef = ref<HTMLElement | null>(null);
// #endregion

// #region Computed
const isEmpty = computed(() => {
    return !slots.default?.();
});

const normalizedPaddingX = computed<number>(
    () => Math.round(Math.max(0, Number(props.layoutProps.paddingX) || 0) * 10) / 10
);
const normalizedPaddingY = computed<number>(
    () => Math.round(Math.max(0, Number(props.layoutProps.paddingY) || 0) * 10) / 10
);

const flexStyle = computed<CSSProperties>(() => {
    const style: CSSProperties = {
        display: 'flex',
        flexDirection: props.layoutProps.direction,
        justifyContent: mapFlexJustify(props.layoutProps.justify),
        alignItems: mapFlexAlign(props.layoutProps.align),
        flexWrap: props.layoutProps.wrap ? 'wrap' : 'nowrap',
        gap: convertPxToRem(props.layoutProps.gap),
        width: '100%',
        minHeight: '2rem',
        position: 'relative',
        pointerEvents: 'auto',
    };

    const px = normalizedPaddingX.value;
    const py = normalizedPaddingY.value;

    if (px > 0 || py > 0) {
        style.padding = `${py}rem ${px}rem`;
    }

    return style;
});

const isHorizontal = computed(() => props.layoutProps.direction === 'row');
// #endregion

// #region Methods
/**
 * Index of the insertion point under the cursor, along the current flex axis.
 *
 * An unmounted container answers `null` rather than an empty zone: index 0 would be a
 * promise of a place in a zone whose children cannot be read at all.
 *
 * @param event - Browser drag event.
 * @returns Index of the insertion point, or null when there is nothing to measure.
 */
function resolveFlexDropIndex(event: DragEvent): number | null {
    if (!flexRef.value) {
        return null;
    }

    return resolveLinearDropIndex(event, isHorizontal.value ? 'horizontal' : 'vertical', () =>
        queryLayoutDropItems(flexRef.value)
    );
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
    containerRef: flexRef,
    layoutId: () => props.layoutId,
    resolveDropIndex: resolveFlexDropIndex,
    placeholderClass: styles.dropPlaceholder,
});
// #endregion
</script>

<template>
    <div
        ref="flexRef"
        :class="[
            $style.BlockFlex,
            { [$style.dragOver]: isDragOver, [$style.gridHidden]: !showGrid },
        ]"
        :style="flexStyle"
        data-layout-drop-zone="true"
        :data-layout-id="layoutId ?? null"
        @dragenter="handleDragEnter"
        @dragover="handleDragOver"
        @dragleave="handleDragLeave"
        @drop="handleDrop"
    >
        <slot />

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
.BlockFlex {
    position: relative;
    min-width: 0;
    border: 1px dashed var(--bricks-base-300);
    background: var(--bricks-base-50);
    transition:
        border-color var(--bricks-default-transition),
        background-color var(--bricks-default-transition),
        box-shadow var(--bricks-default-transition);

    > :global([data-layout-drop-item='true']) {
        min-width: 0;
    }

    &:hover {
        border-color: var(--bricks-primary);
        background: color-mix(in srgb, var(--bricks-primary) 6%, var(--bricks-base-50));
    }

    &.dragOver[data-layout-drop-active='true'] {
        border-color: var(--bricks-primary);
        background: color-mix(in srgb, var(--bricks-primary) 6%, var(--bricks-base-50));
        box-shadow: var(--bricks-canvas-ring-active);
    }
}

.gridHidden {
    border-color: transparent;
    background: transparent;

    &:hover {
        border-color: transparent;
        background: transparent;
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
