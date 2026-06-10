<script setup lang="ts">
// #region Imports
// Types
import type { SectionLayoutProps } from '../../common/types/landing';

// Vue
import { computed, ref, inject, type CSSProperties, type Ref } from 'vue';
// #endregion

// #region Props
const props = defineProps<{
    layoutProps: SectionLayoutProps;
    layoutId?: string;
}>();

const slots = defineSlots<{
    default?: any;
}>();
// #endregion

// #region Data
const showGrid = inject<Ref<boolean>>('showGrid', ref(true));
const sectionRef = ref<HTMLElement | null>(null);
const isDragOver = ref(false);
const dropIndicator = ref<{ index: number; offset: number } | null>(null);
const dropInsertIndex = ref<number | null>(null);
const dropIndicatorRef = ref<HTMLElement | null>(null);
const dragDepth = ref(0);
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

const dropIndicatorVisible = computed(() => dropIndicator.value !== null);

const dropIndicatorStyle = computed<CSSProperties>(() => {
    if (!dropIndicator.value) {
        return { opacity: 0 };
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
 * Handles dragenter event for the section layout.
 */
function handleDragEnter(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    dragDepth.value += 1;
    isDragOver.value = true;
    updateDropEffect(event);
    updateDropIndicator(event);
}

/**
 * Handles dragover event for the section layout.
 */
function handleDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    isDragOver.value = true;
    updateDropEffect(event);
    updateDropIndicator(event);
}

/**
 * Handles dragleave event for the section layout.
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
 * Handles drop event for the section layout.
 */
function handleDrop(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    updateDropEffect(event);
    updateDropIndicator(event);

    const targetIndex = dropInsertIndex.value;
    const componentId = event.dataTransfer?.getData('component-id');

    if (componentId && props.layoutId && componentId === props.layoutId) {
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
    sectionRef.value?.dispatchEvent(layoutDropEvent);

    isDragOver.value = false;
    dropIndicator.value = null;
    dropInsertIndex.value = null;
    dragDepth.value = 0;
}

/**
 * Sets the cursor drop effect based on drag payload type.
 */
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

/**
 * Calculates the drop indicator position based on cursor location.
 */
function updateDropIndicator(event: DragEvent): void {
    const container = sectionRef.value;
    if (!container) {
        return;
    }

    const rect = container.getBoundingClientRect();
    const indicatorEl = dropIndicatorRef.value;
    const children = Array.from(container.children).filter((child) => {
        const el = child as HTMLElement;
        if (indicatorEl && el === indicatorEl) {
            return false;
        }
        if (el.dataset.layoutDropPlaceholder === 'true') {
            return false;
        }
        return el.hasAttribute('data-layout-drop-item');
    }) as HTMLElement[];

    const pointerPosition = event.clientY;
    const containerHeight = rect.height;

    if (children.length === 0) {
        dropIndicator.value = { index: 0, offset: 0 };
        dropInsertIndex.value = 0;
        return;
    }

    let targetIndex = children.length;
    let offset = containerHeight;

    children.some((child, index) => {
        const childRect = child.getBoundingClientRect();
        const mid = childRect.top + (childRect.bottom - childRect.top) / 2;

        if (pointerPosition < mid) {
            targetIndex = index;
            offset = childRect.top - rect.top;
            return true;
        }
        return false;
    });

    if (targetIndex === children.length) {
        const lastChildRect = children[children.length - 1].getBoundingClientRect();
        offset = lastChildRect.bottom - rect.top;
    }

    offset = Math.max(0, Math.min(offset, containerHeight));

    dropIndicator.value = { index: targetIndex, offset };
    dropInsertIndex.value = targetIndex;
}
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
        <div v-if="isEmpty" :class="$style.emptyPlaceholder" data-layout-drop-placeholder="true">
            Drop components here
        </div>

        <!-- Drop indicator -->
        <div
            v-if="dropIndicatorVisible"
            ref="dropIndicatorRef"
            :class="$style.dropIndicator"
            data-layout-drop-indicator="true"
            :style="dropIndicatorStyle"
        />
    </div>
</template>

<style module lang="scss">
.BlockSection {
    position: relative;
    min-width: 0;
    border: 1px dashed rgb(var(--rgb-layout-section) / 30%);
    background-color: rgb(var(--rgb-layout-section) / 5%);
    transition: all 200ms ease;

    > :global([data-layout-drop-item='true']) {
        min-width: 0;
    }

    &:hover {
        border-color: rgb(var(--rgb-layout-section) / 50%);
    }

    &.dragOver {
        border-color: rgb(var(--rgb-layout-section) / 80%);
        border-width: 0.2rem;
        background-color: rgb(var(--rgb-layout-section) / 15%);
        box-shadow: 0 0 0 0.4rem rgb(var(--rgb-layout-section) / 20%);
    }
}

.gridHidden {
    border-color: transparent;
    background-color: transparent;

    &:hover {
        border-color: transparent;
    }
}

.emptyPlaceholder {
    padding: 4rem 2rem;
    text-align: center;
    font-size: 1.4rem;
    font-weight: 500;
    color: rgb(var(--rgb-layout-section) / 50%);
    pointer-events: none;
}

.dropIndicator {
    position: absolute;
    z-index: 5;
    border-radius: 999px;
    background-color: rgb(var(--rgb-layout-section) / 70%);
    pointer-events: none;
}
</style>
