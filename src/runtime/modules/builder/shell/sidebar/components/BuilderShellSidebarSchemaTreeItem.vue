<script setup lang="ts">
// #region Imports
// Types
import type { IBricksComponent } from '../../../../common/types/brick';

// Vue
import { computed, ref } from 'vue';

// Pinia
import { useComponentsStore } from '../../../core/stores/components';
import { useCanvasStore } from '../../../core/stores/canvas';

// Composables
import { useBuilderPermissions } from '../../../core/composables/useBuilderPermissions';

// Utils
import { resolveDeviceIcon } from '../../../../common/utils/bricks/devices';
// #endregion

// #region Interfaces
interface ISidebarSchemaTreeItemProps {
    component: IBricksComponent;
    depth?: number;
    isLast?: boolean;
}
// #endregion

// #region Props
const props = withDefaults(defineProps<ISidebarSchemaTreeItemProps>(), {
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
const componentsStore = useComponentsStore();
const canvasStore = useCanvasStore();
const { canEdit } = useBuilderPermissions();
const dragOverPosition = ref<'before' | 'after' | null>(null);
// #endregion

// #region Computed
const isSelected = computed<boolean>(() => componentsStore.isComponentSelected(props.component.id));

/** Индикаторы видимости — по одному на устройство набора страницы. */
const deviceIndicators = computed(() =>
    canvasStore.devices.map((device) => ({
        key: device.key,
        label: device.label,
        icon: resolveDeviceIcon(device.icon),
        isVisible: props.component.deviceVisibility?.[device.key] !== false,
    }))
);

const isHidden = computed<boolean>(() => props.component.isHidden === true);

const childComponents = computed<IBricksComponent[]>(() => {
    if (!props.component.children?.length) {
        return [];
    }

    return props.component.children
        .map((childId) => componentsStore.getComponentById(childId))
        .filter((child): child is IBricksComponent => Boolean(child));
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
    <div
        :class="[$style.BuilderShellSidebarSchemaTreeItem, { [$style._hasChildren]: hasChildren }]"
    >
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

            <!--
                Дерево остаётся навигацией при любой роли, но перестановка блоков
                мышью — правка схемы: без права правки строка не тянется
            -->
            <button
                type="button"
                :draggable="canEdit"
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
                    <BricksIcon
                        v-if="isLayout"
                        icon="ta:outline-layout-grid-add"
                        :class="$style.typeIcon"
                    />
                    <BricksIcon v-else icon="ta:outline-puzzle" :class="$style.typeIcon" />
                    {{ displayName }}
                </span>

                <span :class="$style.icons">
                    <BricksIcon v-if="isHidden" icon="ta:outline-eye" :class="$style.hiddenIcon" />

                    <BricksIcon
                        v-for="indicator in deviceIndicators"
                        :key="indicator.key"
                        :icon="indicator.icon"
                        :title="indicator.label"
                        :class="[$style.deviceIcon, { [$style._inactive]: !indicator.isVisible }]"
                    />
                </span>
            </button>

            <!-- Drop indicator after -->
            <div v-if="dragOverPosition === 'after'" :class="$style.dropIndicator" />
        </div>

        <div v-if="hasChildren" :class="$style.children">
            <BuilderShellSidebarSchemaTreeItem
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
.BuilderShellSidebarSchemaTreeItem {
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
    transition: background-color var(--bricks-default-transition);
    cursor: grab;

    &:hover {
        background-color: var(--bricks-base-100);
    }

    &._selected {
        background-color: var(--bricks-primary-100, var(--bricks-base-200));
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
    font-size: 1.4rem;
    font-weight: 500;
    color: var(--bricks-base-800);
    gap: 0.4rem;
}

.typeIcon {
    flex-shrink: 0;
    width: 1.4rem;
    height: 1.4rem;
    color: var(--bricks-base-500);
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
    color: var(--bricks-base-600);
    transition: opacity var(--bricks-default-transition);

    &._inactive {
        opacity: 0.2;
    }
}

.hiddenIcon {
    width: 1.2rem;
    height: 1.2rem;
    color: var(--bricks-danger-600);
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
    border-left: 1px dashed var(--bricks-base-300);

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
    border-top: 1px dashed var(--bricks-base-300);
}

.dropIndicator {
    height: 0.2rem;
    border-radius: 0.2rem;
    background: rgb(var(--bricks-rgb-primary) / 70%);
}
</style>
