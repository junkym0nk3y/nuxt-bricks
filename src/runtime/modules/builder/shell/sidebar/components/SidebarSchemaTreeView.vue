<script setup lang="ts">
// #region Imports
// Types
import type { BricksComponent, PropertyDefinition } from '../../../../common/types/brick';
import type { IBrickValues } from '../../../../common/types/index';

// Vue
import { computed, nextTick } from 'vue';

// Pinia
import { useComponentsStore } from '../../../core/stores/components';
import { useCanvasStore } from '../../../core/stores/canvas';

// Composables
import { useStoryImports } from '../../../../common/composables/useStoryImports';
import { useComponentProperties } from '../../../core/composables/useComponentProperties';

// Utils
import { getLayoutProperties } from '../../../core/utils/layoutProperties';
import { scrollToComponentOnCanvas } from '../../../core/utils/scrollToComponent';

// Constants
import { LAYOUT_COMPONENTS } from '../../../core/constants/layoutComponents';

// Components
import SidebarSchemaTreeItem from './SidebarSchemaTreeItem.vue';
import BricksCloseButton from '../../../../ui/base/modal/BricksCloseButton.vue';
// #endregion

// #region Emits
const emit = defineEmits<{
    close: [];
}>();
// #endregion

// #region Data
const componentsStore = useComponentsStore();
const canvasStore = useCanvasStore();
const { findImportModule } = useStoryImports();
const { storyValuesToProperties } = useComponentProperties();
// #endregion

// #region Computed
/**
 * Возвращает корневые компоненты (без parent) для построения дерева.
 */
const rootComponents = computed<BricksComponent[]>(() => componentsStore.getRootComponents());

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
function ensureViewportForComponent(component: BricksComponent): boolean {
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

    // Порядок приоритета: desktop → tablet → mobile
    const VIEWPORT_PRIORITY: Array<'desktop' | 'tablet' | 'mobile'> = [
        'desktop',
        'tablet',
        'mobile',
    ];

    const firstAvailable = VIEWPORT_PRIORITY.find((vp) => visibility[vp] !== false);
    if (firstAvailable) {
        canvasStore.setViewport(firstAvailable);
        return true;
    }

    return false;
}

/**
 * Выбирает компонент, загружает его properties из story и открывает панель свойств.
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

    // 2. Загружаем properties
    let properties: PropertyDefinition[] = [];
    let description: string | undefined;

    if (component.type === 'layout') {
        properties = getLayoutProperties(component.componentName.toLowerCase());
        description = LAYOUT_COMPONENTS.find(
            (item) => item.storyPath === component.storyPath
        )?.description;
    } else {
        const moduleLoader = findImportModule(component.storyPath);
        if (moduleLoader) {
            try {
                const module = await moduleLoader();
                if (module?.story) {
                    const story = module.story as Record<string, unknown>;
                    description = story.description as string | undefined;

                    if (story.values !== undefined) {
                        properties = storyValuesToProperties(
                            story.values as Record<string, IBrickValues>
                        );
                    }
                }
            } catch (error) {
                console.error('[SidebarSchemaTreeView] Failed to load story:', error);
            }
        }
    }

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
    <div :class="$style.SidebarSchemaTreeView">
        <div :class="$style.header">
            <h2 :class="$style.title">Схема страницы</h2>
            <BricksCloseButton @click="handleClose" />
        </div>

        <div :class="[$style.content, 'scrollbox']">
            <div v-if="hasComponents" :class="$style.tree">
                <SidebarSchemaTreeItem
                    v-for="(component, index) in rootComponents"
                    :key="component.id"
                    :component="component"
                    :depth="0"
                    :is-last="index === rootComponents.length - 1"
                    @select="handleSelectComponent"
                    @reorder="handleReorder"
                />
            </div>

            <div v-else :class="$style.empty">
                <BricksIcon icon="re:drag-drop-line" :class="$style.emptyIcon" />
                <p>Нет компонентов</p>
                <p :class="$style.emptyHint">Добавьте компоненты на канвас из библиотеки</p>
            </div>
        </div>
    </div>
</template>

<style module lang="scss">
.SidebarSchemaTreeView {
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

.empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    text-align: center;
    color: var(--bricks-base-400);

    p {
        margin: 0.8rem 0;
    }
}

.emptyIcon {
    width: 6.4rem;
    height: 6.4rem;
    margin-bottom: 1.6rem;
    color: var(--bricks-base-300);
}

.emptyHint {
    font-size: 1.2rem;
    color: var(--bricks-base-400);
}
</style>
