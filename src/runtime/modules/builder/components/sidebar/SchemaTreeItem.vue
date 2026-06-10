<script setup lang="ts">
// #region Imports
// Types
import type { LandingComponent } from '../../../common/types/landing';

// Vue
import { computed, ref } from 'vue';

// Pinia
import { useLandingComponentsStore } from '../../stores/components';
// #endregion

// #region Interfaces
interface ISchemaTreeItemProps {
    component: LandingComponent;
    depth?: number;
    isLast?: boolean;
}
// #endregion

// #region Props
const props = withDefaults(defineProps<ISchemaTreeItemProps>(), {
    depth: 0,
    isLast: false,
});
// #endregion

// #region Emits
const emit = defineEmits<{
    select: [id: string];
    reorder: [componentId: string, targetId: string, position: 'before' | 'after'];
}>();
// #endregion

// #region Data
const componentsStore = useLandingComponentsStore();
const dragOverPosition = ref<'before' | 'after' | null>(null);
// #endregion

// #region Computed
const isSelected = computed<boolean>(() => componentsStore.isComponentSelected(props.component.id));

const isMobileVisible = computed<boolean>(() => props.component.deviceVisibility?.mobile !== false);

const isTabletVisible = computed<boolean>(() => props.component.deviceVisibility?.tablet !== false);

const isDesktopVisible = computed<boolean>(
    () => props.component.deviceVisibility?.desktop !== false
);

const isHidden = computed<boolean>(() => props.component.isHidden === true);

const childComponents = computed<LandingComponent[]>(() => {
    if (!props.component.children?.length) {
        return [];
    }

    return props.component.children
        .map((childId) => componentsStore.getComponentById(childId))
        .filter((child): child is LandingComponent => Boolean(child));
});

const displayName = computed<string>(() => props.component.componentName);

const isLayout = computed<boolean>(() => props.component.type === 'layout');

const hasChildren = computed<boolean>(() => childComponents.value.length > 0);
// #endregion

// #region Methods
/**
 * Выбирает компонент по клику на элемент дерева.
 */
function handleSelect(): void {
    emit('select', props.component.id);
}

/**
 * Начинает drag элемента дерева.
 *
 * @param event - Событие dragstart.
 */
function handleDragStart(event: DragEvent): void {
    if (!event.dataTransfer) {
        return;
    }

    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('tree-component-id', props.component.id);
}

/**
 * Определяет позицию drop (before/after) по координатам курсора.
 *
 * @param event - Событие dragover.
 */
function handleDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();

    if (!event.dataTransfer) {
        return;
    }

    event.dataTransfer.dropEffect = 'move';

    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    dragOverPosition.value = event.clientY < midY ? 'before' : 'after';
}

/**
 * Сбрасывает индикатор при выходе курсора.
 */
function handleDragLeave(): void {
    dragOverPosition.value = null;
}

/**
 * Обрабатывает drop — вычисляет позицию и эмитит reorder.
 *
 * @param event - Событие drop.
 */
function handleDrop(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();

    const draggedId = event.dataTransfer?.getData('tree-component-id');
    if (!draggedId || draggedId === props.component.id) {
        dragOverPosition.value = null;
        return;
    }

    const position = dragOverPosition.value || 'after';
    emit('reorder', draggedId, props.component.id, position);
    dragOverPosition.value = null;
}
// #endregion
</script>

<template>
    <div :class="[$style.SchemaTreeItem, { [$style._hasChildren]: hasChildren }]">
        <div :class="$style.rowWrapper">
            <!-- Линии дерева -->
            <div
                v-if="props.depth > 0"
                :class="$style.treeLine"
                :style="{ left: `${(props.depth - 1) * 1.6 + 1.2}rem` }"
            >
                <div :class="[$style.verticalLine, { [$style._last]: props.isLast }]" />
                <div :class="$style.horizontalLine" />
            </div>

            <!-- Drop indicator -->
            <div v-if="dragOverPosition === 'before'" :class="$style.dropIndicator" />

            <button
                type="button"
                draggable="true"
                :class="[
                    $style.row,
                    { [$style._selected]: isSelected, [$style._hidden]: isHidden },
                ]"
                :style="{ paddingLeft: `${props.depth * 1.6 + 0.8}rem` }"
                @click="handleSelect"
                @dragstart="handleDragStart"
                @dragover="handleDragOver"
                @dragleave="handleDragLeave"
                @drop="handleDrop"
            >
                <span :class="$style.name">
                    <BricksLandIcon
                        v-if="isLayout"
                        icon="an:outlined-appstore-add"
                        :class="$style.typeIcon"
                    />
                    <BricksLandIcon v-else icon="ui:component" :class="$style.typeIcon" />
                    {{ displayName }}
                </span>

                <span :class="$style.icons">
                    <BricksLandIcon v-if="isHidden" icon="fa:reg-eye" :class="$style.hiddenIcon" />

                    <BricksLandIcon
                        icon="ak:mobile-device"
                        :class="[$style.deviceIcon, { [$style._inactive]: !isMobileVisible }]"
                    />
                    <BricksLandIcon
                        icon="ak:credit-card-alt-1"
                        :class="[$style.deviceIcon, { [$style._inactive]: !isTabletVisible }]"
                    />
                    <BricksLandIcon
                        icon="ak:desktop-device"
                        :class="[$style.deviceIcon, { [$style._inactive]: !isDesktopVisible }]"
                    />
                </span>
            </button>

            <!-- Drop indicator after -->
            <div v-if="dragOverPosition === 'after'" :class="$style.dropIndicator" />
        </div>

        <div v-if="hasChildren" :class="$style.children">
            <SchemaTreeItem
                v-for="(child, index) in childComponents"
                :key="child.id"
                :component="child"
                :depth="props.depth + 1"
                :is-last="index === childComponents.length - 1"
                @select="(id: string) => emit('select', id)"
                @reorder="
                    (draggedId: string, targetId: string, position: 'before' | 'after') =>
                        emit('reorder', draggedId, targetId, position)
                "
            />
        </div>
    </div>
</template>

<style module lang="scss">
.SchemaTreeItem {
    position: relative;
    width: 100%;
}

.rowWrapper {
    position: relative;
}

.row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    padding: 0.6rem 0.8rem;
    border-radius: 0.4rem;
    border: none;
    background: transparent;
    transition: background-color var(--default-transition);
    cursor: grab;

    &:hover {
        background-color: var(--land-base-100);
    }

    &._selected {
        background-color: var(--land-primary-100, var(--land-base-200));
    }

    &._hidden {
        opacity: 0.5;
    }

    &:active {
        cursor: grabbing;
    }
}

.name {
    overflow: hidden;
    display: flex;
    align-items: center;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 1.3rem;
    font-weight: 500;
    color: var(--land-base-800);
    gap: 0.4rem;
}

.typeIcon {
    flex-shrink: 0;
    width: 1.4rem;
    height: 1.4rem;
    color: var(--land-base-500);
}

.icons {
    display: flex;
    align-items: center;
    gap: 0.2rem;
    flex-shrink: 0;
    margin-left: 0.4rem;
}

.deviceIcon {
    width: 1.2rem;
    height: 1.2rem;
    color: var(--land-base-600);
    transition: opacity var(--default-transition);

    &._inactive {
        opacity: 0.2;
    }
}

.hiddenIcon {
    width: 1.2rem;
    height: 1.2rem;
    color: var(--land-danger-600);
}

.children {
    position: relative;
    width: 100%;
}

// Tree lines
.treeLine {
    position: absolute;
    top: 0;
    bottom: 0;
    z-index: 1;
    pointer-events: none;
}

.verticalLine {
    position: absolute;
    top: -0.4rem;
    left: 0;
    width: 1px;
    height: calc(50% + 0.4rem);
    border-left: 1px dashed var(--land-base-300);

    &._last {
        height: calc(50% + 0.4rem);
    }
}

.horizontalLine {
    position: absolute;
    top: 50%;
    left: 0;
    width: 1.2rem;
    height: 1px;
    border-top: 1px dashed var(--land-base-300);
}

.dropIndicator {
    height: 0.2rem;
    border-radius: 0.2rem;
    background: rgb(var(--rgb-indigo) / 70%);
}
</style>
