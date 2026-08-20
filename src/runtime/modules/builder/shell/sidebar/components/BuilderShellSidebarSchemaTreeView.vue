<script setup lang="ts">
// #region Imports
// Types
import type { IBricksComponent } from '../../../../common/types/brick';

// Vue
import { computed, nextTick } from 'vue';
import { useI18n } from 'vue-i18n';

// Pinia
import { useComponentsStore } from '../../../core/stores/components';
import { useCanvasStore } from '../../../core/stores/canvas';

// Constants
import { BASE_DEVICE_KEY } from '../../../../common/constants/devices';

// Composables
import { useComponentEditorMetadata } from '../../../core/composables/useComponentEditorMetadata';

// Utils
import { scrollToComponentOnCanvas } from '../../../core/utils/scrollToComponent';

// Components
import BuilderShellSidebarSchemaTreeItem from './BuilderShellSidebarSchemaTreeItem.vue';
import BricksCloseButton from '../../../../ui/base/modal/BricksCloseButton.vue';
import BricksEmptyState from '../../../../ui/feedback/BricksEmptyState.vue';
// #endregion

// #region Emits
const emit = defineEmits<{
    close: [];
}>();
// #endregion

// #region Data
const { t } = useI18n();
const componentsStore = useComponentsStore();
const canvasStore = useCanvasStore();
const { resolveComponentEditorMetadata } = useComponentEditorMetadata();
// #endregion

// #region Computed
/**
 * Возвращает корневые компоненты (без parent) для построения дерева.
 */
const rootComponents = computed<IBricksComponent[]>(() => componentsStore.getRootComponents());

const hasComponents = computed<boolean>(() => componentsStore.hasComponents);
// #endregion

// #region Methods
/**
 * Закрывает панель схемы.
 */
function handleClose(): void {
    emit('close');
}

/**
 * Переставляет компонент в дереве на основе позиции drop.
 *
 * @param draggedId - ID перетаскиваемого компонента.
 * @param targetId - ID целевого компонента (куда бросили).
 * @param position - Позиция относительно target: before или after.
 */
function handleReorder(draggedId: string, targetId: string, position: 'before' | 'after'): void {
    const rootComponents = componentsStore.getRootComponents();
    const targetIndex = rootComponents.findIndex((c) => c.id === targetId);

    if (targetIndex === -1) {
        return;
    }

    const newIndex = position === 'before' ? targetIndex : targetIndex + 1;
    componentsStore.moveComponentToRoot(draggedId, newIndex);
}

/**
 * Переключает viewport на первый доступный для компонента, если текущий не подходит.
 * Если компонент видим на текущем viewport — ничего не делает.
 *
 * @param component - Компонент для проверки видимости.
 * @returns true, если viewport был переключён.
 */
function ensureViewportForComponent(component: IBricksComponent): boolean {
    const currentViewport = canvasStore.viewport;
    const visibility = component.deviceVisibility;

    // Если нет ограничений по устройствам — всё видно
    if (!visibility) {
        return false;
    }

    const isVisibleOnCurrent = visibility[currentViewport] !== false;
    if (isVisibleOnCurrent) {
        return false;
    }

    // Приоритет: базовое устройство, затем остальные от широкого к узкому —
    // на широком листе блок виден целиком, и переключение туда информативнее
    const priority = [
        ...canvasStore.devices.filter((device) => device.key === BASE_DEVICE_KEY),
        ...[...canvasStore.devices].reverse().filter((device) => device.key !== BASE_DEVICE_KEY),
    ];

    const firstAvailable = priority.find((device) => visibility[device.key] !== false);
    if (firstAvailable) {
        canvasStore.setViewport(firstAvailable.key);
        return true;
    }

    return false;
}

/**
 * Выбирает компонент, берёт его properties из метаданных и открывает панель свойств.
 * Переключает viewport, если компонент не виден на текущем устройстве, и скроллит до него.
 *
 * @param id - ID выбранного компонента.
 */
async function handleSelectComponent(id: string): Promise<void> {
    const component = componentsStore.getComponentById(id);
    if (!component) {
        return;
    }

    // 1. Переключаем viewport, если компонент не виден на текущем
    const viewportSwitched = ensureViewportForComponent(component);

    // 2. Берём properties — тем же резолвером, что и выбор кликом по канвасу
    const { properties, description } = resolveComponentEditorMetadata(component);

    // 3. Выбираем компонент и открываем панель свойств
    componentsStore.selectComponent(id, properties, description);

    // 4. Скроллим до компонента на канвасе
    // В Figma mode скоупим поиск на активный viewport
    // Если viewport переключался, ждём завершения анимации (400ms + nextTick)
    const scrollViewport =
        canvasStore.isFigmaMode && canvasStore.activeViewport
            ? canvasStore.activeViewport
            : undefined;

    if (viewportSwitched) {
        setTimeout(async () => {
            await nextTick();
            scrollToComponentOnCanvas(id, scrollViewport);
        }, 450);
    } else {
        await nextTick();
        scrollToComponentOnCanvas(id, scrollViewport);
    }
}
// #endregion
</script>

<template>
    <div :class="$style.BuilderShellSidebarSchemaTreeView">
        <div :class="$style.header">
            <h2 :class="$style.title">{{ t('bricks.schema.title') }}</h2>
            <BricksCloseButton @click="handleClose" />
        </div>

        <div :class="[$style.content, 'bricks-scrollbox']">
            <div v-if="hasComponents" :class="$style.tree">
                <BuilderShellSidebarSchemaTreeItem
                    v-for="(component, index) in rootComponents"
                    :key="component.id"
                    :component="component"
                    :depth="0"
                    :is-last="index === rootComponents.length - 1"
                    @select="handleSelectComponent"
                    @reorder="handleReorder"
                />
            </div>

            <BricksEmptyState
                v-else
                :class="$style.empty"
                size="sm"
                icon="ta:outline-drag-drop"
                :title="t('bricks.schema.empty')"
                :description="t('bricks.schema.emptyHint')"
            />
        </div>
    </div>
</template>

<style module lang="scss">
.BuilderShellSidebarSchemaTreeView {
    overflow-y: auto;
    display: flex;
    flex: 1;
    flex-direction: column;
}

.header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1.6rem 2rem;
    border-bottom: 1px solid var(--bricks-base-300);
}

.title {
    margin: 0;
    font-size: 1.6rem;
    font-weight: 600;
    color: var(--bricks-base-900);
}

.content {
    overflow-y: auto;
    flex: 1;
    padding: 0.8rem;
}

.tree {
    display: flex;
    flex-direction: column;
}

/* Состояние занимает всю свободную высоту панели. */
.empty {
    height: 100%;
}
</style>
