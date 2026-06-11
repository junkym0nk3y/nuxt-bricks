<script setup lang="ts">
// #region Imports
// Types
import type { FlexLayoutProps } from '../../common/types/brick';

// Vue
import { computed, ref, inject, type CSSProperties, type Ref } from 'vue';

// Utils
import { convertPxToRem } from '../../common/utils/main';
// #endregion

// #region Props
const props = defineProps<{
    layoutProps: FlexLayoutProps;
    layoutId?: string;
}>();

const slots = defineSlots<{
    default?: any;
}>();
// #endregion

// #region Data
const showGrid = inject<Ref<boolean>>('showGrid', ref(true));
const flexRef = ref<HTMLElement | null>(null);
const isDragOver = ref(false);
const dropIndicator = ref<{ index: number; offset: number } | null>(null);
const dropInsertIndex = ref<number | null>(null);
const dropIndicatorRef = ref<HTMLElement | null>(null);
const dragDepth = ref(0);

const justifyMap: Record<FlexLayoutProps['justify'], CSSProperties['justifyContent']> = {
    start: 'flex-start',
    center: 'center',
    end: 'flex-end',
    'space-between': 'space-between',
    'space-around': 'space-around',
};

const alignMap: Record<FlexLayoutProps['align'], CSSProperties['alignItems']> = {
    stretch: 'stretch',
    start: 'flex-start',
    center: 'center',
    end: 'flex-end',
    baseline: 'baseline',
};
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
        justifyContent: justifyMap[props.layoutProps.justify],
        alignItems: alignMap[props.layoutProps.align ?? 'stretch'],
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

const dropIndicatorVisible = computed(() => dropIndicator.value !== null);

const dropIndicatorStyle = computed<CSSProperties>(() => {
    if (!dropIndicator.value) {
        return {
            opacity: 0,
        };
    }

    if (isHorizontal.value) {
        return {
            opacity: 1,
            left: `${dropIndicator.value.offset}px`,
            top: '0',
            height: '100%',
            width: '0.2rem',
            transform: 'translateX(-50%)',
        };
    }

    return {
        opacity: 1,
        top: `${dropIndicator.value.offset}px`,
        left: '0',
        width: '100%',
        height: '0.2rem',
        transform: 'translateY(-50%)',
    };
});
// #endregion

// #region Methods
/**
 * Prevents default drag behavior to enable dropping on the flex layout.
 *
 * @param event - Drag event fired when dragging over the layout.
 */
function handleDragEnter(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    dragDepth.value += 1;
    isDragOver.value = true;

    updateDropEffect(event);
    updateDropIndicator(event);
}

function handleDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    isDragOver.value = true;

    updateDropEffect(event);
    updateDropIndicator(event);
}

/**
 * Resets drag-over state when the cursor leaves the layout area.
 *
 * @param event - Drag event triggered when the pointer leaves the drop zone.
 */
function handleDragLeave(event: DragEvent): void {
    event.stopPropagation();
    dragDepth.value = Math.max(0, dragDepth.value - 1);
    if (dragDepth.value > 0) {
        return;
    }

    isDragOver.value = false;
    dropIndicator.value = null;
    dropInsertIndex.value = null;
}

/**
 * Emits layout-drop event with component information when an item is dropped.
 *
 * @param event - Drag event fired on drop.
 */
function handleDrop(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();

    updateDropEffect(event);
    updateDropIndicator(event);

    const targetIndex = dropInsertIndex.value;

    const componentId = event.dataTransfer?.getData('component-id');

    if (componentId && props.layoutId && componentId === props.layoutId) {
        console.warn('[BlockFlex] Ignoring self drop attempt');
        isDragOver.value = false;
        dropIndicator.value = null;
        dropInsertIndex.value = null;
        dragDepth.value = 0;
        return;
    }

    const layoutDropEvent = new CustomEvent('layout-drop', {
        detail: {
            layoutId: props.layoutId,
            movedComponentId: componentId || null,
            targetIndex,
        },
        bubbles: true,
    });
    flexRef.value?.dispatchEvent(layoutDropEvent);

    isDragOver.value = false;
    dropIndicator.value = null;
    dropInsertIndex.value = null;
    dragDepth.value = 0;
}

function updateDropEffect(event: DragEvent): void {
    if (!event.dataTransfer) {
        return;
    }

    const types = Array.from(event.dataTransfer.types || []);
    const isExisting = types.includes('component-id') || types.includes('text/plain');
    const isLibrary = types.includes('application/json');

    if (!isExisting && !isLibrary) {
        dropIndicator.value = null;
        dropInsertIndex.value = null;
        event.dataTransfer.dropEffect = 'none';
        return;
    }

    event.dataTransfer.dropEffect = isExisting ? 'move' : 'copy';
}

function updateDropIndicator(event: DragEvent): void {
    const container = flexRef.value;
    if (!container) {
        return;
    }

    const rect = container.getBoundingClientRect();
    const indicatorEl = dropIndicatorRef.value;
    const children = Array.from(container.children).filter((child) => {
        const el = child as HTMLElement;
        if (!el) {
            return false;
        }
        if (indicatorEl && el === indicatorEl) {
            return false;
        }
        if (el.dataset.layoutDropPlaceholder === 'true') {
            return false;
        }
        return el.hasAttribute('data-layout-drop-item');
    }) as HTMLElement[];

    const pointerPosition = isHorizontal.value ? event.clientX : event.clientY;
    const containerExtent = isHorizontal.value ? rect.width : rect.height;
    const halfGap = (props.layoutProps.gap || 0) / 2;

    if (children.length === 0) {
        console.debug('[BlockFlex] updateDropIndicator: empty, set index 0');
        dropIndicator.value = { index: 0, offset: 0 };
        dropInsertIndex.value = 0;
        return;
    }

    let targetIndex = children.length;
    let offset = containerExtent;

    children.some((child, index) => {
        const childRect = child.getBoundingClientRect();
        const start = isHorizontal.value ? childRect.left : childRect.top;
        const end = isHorizontal.value ? childRect.right : childRect.bottom;
        const mid = start + (end - start) / 2;

        if (pointerPosition < mid) {
            targetIndex = index;
            const baseOffset = isHorizontal.value
                ? childRect.left - rect.left
                : childRect.top - rect.top;
            const childStyle = window.getComputedStyle(child as HTMLElement);
            const marginBefore = parseFloat(
                (isHorizontal.value ? childStyle.marginLeft : childStyle.marginTop) || '0'
            );
            const spacingBefore = Math.max(halfGap, marginBefore / 2);
            offset = baseOffset - spacingBefore;
            return true;
        }
        return false;
    });

    if (targetIndex === children.length) {
        const lastChildRect = children[children.length - 1].getBoundingClientRect();
        const lastChildStyle = window.getComputedStyle(
            children[children.length - 1] as HTMLElement
        );
        const marginAfter = parseFloat(
            (isHorizontal.value ? lastChildStyle.marginRight : lastChildStyle.marginBottom) || '0'
        );
        const spacingAfter = Math.max(halfGap, marginAfter / 2);
        const baseOffset = isHorizontal.value
            ? lastChildRect.right - rect.left
            : lastChildRect.bottom - rect.top;
        offset = baseOffset + spacingAfter;
    }

    offset = Math.max(0, Math.min(offset, containerExtent));

    console.debug('[BlockFlex] updateDropIndicator', {
        pointerPosition,
        targetIndex,
        offset,
        childIds: children.map((child) => child.dataset.componentId || child.id),
    });

    dropIndicator.value = {
        index: targetIndex,
        offset,
    };

    dropInsertIndex.value = targetIndex;
}
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
        <!-- Content -->
        <slot />

        <!-- Drop placeholder when empty -->
        <div v-if="isEmpty" :class="$style.emptyPlaceholder" data-layout-drop-placeholder="true">
            Drop components here
        </div>

        <!-- Drop indicator -->
        <div
            v-if="dropIndicatorVisible"
            ref="dropIndicatorRef"
            :class="[
                $style.dropIndicator,
                isHorizontal ? $style.dropIndicatorVertical : $style.dropIndicatorHorizontal,
            ]"
            data-layout-drop-indicator="true"
            :style="dropIndicatorStyle"
        />
    </div>
</template>

<style module lang="scss">
.BlockFlex {
    position: relative;
    min-width: 0;
    border: 1px dashed rgb(var(--rgb-layout-flex) / 30%);
    background: rgb(var(--rgb-layout-flex) / 5%);
    transition: all 200ms ease;

    > :global([data-layout-drop-item='true']) {
        min-width: 0;
    }

    &:hover {
        border-color: rgb(var(--rgb-layout-flex) / 50%);
        background: rgb(var(--rgb-layout-flex) / 8%);
    }

    &.dragOver {
        border-color: rgb(var(--rgb-layout-flex) / 80%);
        border-width: 0.2rem;
        background: rgb(var(--rgb-layout-flex) / 15%);
        box-shadow: 0 0 0 0.4rem rgb(var(--rgb-layout-flex) / 20%);
    }
}

.gridHidden {
    border-color: transparent;
    background: transparent;

    &:hover {
        border-color: transparent;
        background: transparent;
    }
}

.emptyPlaceholder {
    padding: 4rem 2rem;
    text-align: center;
    font-size: 1.4rem;
    font-weight: 500;
    color: rgb(var(--rgb-layout-flex) / 50%);
    pointer-events: none;
}

.dropIndicator {
    position: absolute;
    z-index: 5;
    border-radius: 999px;
    background-color: rgb(var(--rgb-layout-flex) / 70%);
    pointer-events: none;
}

.dropIndicatorVertical {
    width: 0.4rem;
    height: 100%;
}

.dropIndicatorHorizontal {
    width: 100%;
    height: 0.4rem;
}
</style>
