import type { BricksComponent } from '../../../common/types/brick';
import {
    cloneComponentProps,
    createComponentSlot,
    isLayoutComponent,
    removeChildFromLayout as removeChildFromLayoutHelper,
} from '../../../common/utils/bricks/components';
import { generateComponentId, normalizeStoryPath } from '../../../common/utils/bricks/paths';
import { useSidebarStore } from '../sidebar';
import type {
    IComponentsStore,
    IComponentsCrudActions,
    TComponentInsertPayload,
    THistoryOptions,
    TMoveComponentToLayoutOptions,
} from '../types';

/**
 * Вычисляет значение grid-свойства (gridColumn/gridRow) при перемещении компонента.
 *
 * Приоритеты:
 * 1. Явно переданное значение в options
 * 2. Если передан targetIndex (позиционирование по DOM-порядку) — очистить
 * 3. Для grid-layout — сохранить текущее значение компонента
 * 4. Иначе — очистить
 */
function resolveGridProperty(
    explicitValue: string | undefined,
    currentValue: string | undefined,
    hasExplicitIndex: boolean,
    isGridLayout: boolean
): string | undefined {
    if (explicitValue !== undefined) {
        return explicitValue || undefined;
    }

    if (hasExplicitIndex) {
        return undefined;
    }

    return isGridLayout ? currentValue : undefined;
}

/**
 * Набор CRUD-операций по управлению компонентами канваса и их иерархией.
 */
export const crudActions: IComponentsCrudActions = {
    /**
     * Создаёт новый компонент канваса с уникальным ID и корректным z-index.
     *
     * @param component - Параметры компонента без системных полей.
     * @param options - Флаги управления побочными эффектами (история и т.д.).
     * @returns Сгенерированный идентификатор компонента.
     */
    addComponent(
        this: IComponentsStore,
        component: TComponentInsertPayload,
        options?: THistoryOptions
    ) {
        const id = generateComponentId();
        const maxZIndex = Math.max(0, ...this.components.map((c) => c.zIndex));
        const isLayout = component.storyPath.startsWith('layout/');

        const newComponent: BricksComponent = {
            ...component,
            id,
            type: isLayout ? 'layout' : 'component',
            zIndex: maxZIndex + 1,
            children: isLayout ? [] : undefined,
            slots: component.slots?.map((slot) => createComponentSlot(slot)),
            storyPath: normalizeStoryPath(component.storyPath),
            props: cloneComponentProps(component.props),
            fullWidth: false,
        };

        this.components.push(newComponent);

        if (!options?.skipHistory) {
            this.saveToHistory();
        }
        return id;
    },

    /**
     * Удаляет компонент по ID, рекурсивно снимая все дочерние связи и обновляя выбор.
     *
     * @param id - Идентификатор компонента, который требуется удалить.
     */
    removeComponent(this: IComponentsStore, id: string) {
        const target = this.getComponentById(id);
        if (!target) {
            return;
        }

        this.detachComponentFromParent(id, { skipHistory: true });

        const idsToRemove = new Set<string>();
        const queue: BricksComponent[] = [target];

        while (queue.length > 0) {
            const current = queue.shift();
            if (!current || idsToRemove.has(current.id)) {
                continue;
            }

            idsToRemove.add(current.id);

            current.children?.forEach((childId) => {
                const child = this.getComponentById(childId);
                if (child) {
                    queue.push(child);
                }
            });

            current.slots?.forEach((slot) => {
                slot.children.forEach((childId) => {
                    const child = this.getComponentById(childId);
                    if (child) {
                        queue.push(child);
                    }
                });
            });
        }

        if (idsToRemove.size === 0) {
            return;
        }

        this.components = this.components.filter((component) => {
            if (!idsToRemove.has(component.id)) {
                return true;
            }

            if (component.parent && !idsToRemove.has(component.parent)) {
                component.parent = undefined;
                component.slotName = undefined;
                component.gridColumn = undefined;
                component.gridRow = undefined;
            }

            return false;
        });

        if (this.selectedComponent && idsToRemove.has(this.selectedComponent.id)) {
            this.selectedComponent = null;
            const sidebarStore = useSidebarStore();
            if (sidebarStore.activeView === 'properties') {
                sidebarStore.setActiveView('components');
            }
        }

        this.saveToHistory();
    },

    /**
     * Отвязывает компонент от родителя и очищает позиционные свойства.
     *
     * @param childId - Идентификатор дочернего компонента.
     * @param options - Опции для пропуска записи в историю.
     */
    detachComponentFromParent(
        this: IComponentsStore,
        childId: string,
        options?: THistoryOptions
    ) {
        const child = this.getComponentById(childId);
        if (!child?.parent) {
            return;
        }

        const parent = this.getComponentById(child.parent);

        parent?.children?.splice(parent.children.indexOf(childId), 1);
        parent?.slots?.forEach((slot) => {
            const idx = slot.children.indexOf(childId);
            if (idx !== -1) {
                slot.children.splice(idx, 1);
            }
        });

        child.parent = undefined;
        child.slotName = undefined;
        child.gridColumn = undefined;
        child.gridRow = undefined;
        child.fullWidth = false;

        if (!options?.skipHistory) {
            this.saveToHistory();
        }
    },

    /**
     * Добавляет дочерний компонент в layout в конкретную позицию.
     *
     * @param layoutId - ID layout-компонента.
     * @param childId - ID добавляемого компонента.
     * @param index - Желаемая позиция вставки.
     * @param options - Дополнительные настройки истории.
     */
    addChildToLayout(
        this: IComponentsStore,
        layoutId: string,
        childId: string,
        index?: number | null,
        options?: THistoryOptions
    ) {
        const layout = this.getComponentById(layoutId);
        const child = this.getComponentById(childId);
        if (!layout || !child || !isLayoutComponent(layout)) {
            return;
        }

        layout.children = layout.children || [];
        if (layout.children.includes(childId)) {
            return;
        }

        const insertIndex =
            typeof index === 'number'
                ? Math.max(0, Math.min(index, layout.children.length))
                : layout.children.length;

        layout.children.splice(insertIndex, 0, childId);
        child.parent = layoutId;
        child.slotName = undefined;
        if (layout.componentName !== 'grid') {
            child.gridColumn = undefined;
            child.gridRow = undefined;
        }
        child.fullWidth = undefined;

        if (!options?.skipHistory) {
            this.saveToHistory();
        }
    },

    /**
     * Удаляет дочерний компонент из layout и очищает метаданные позиционирования.
     *
     * @param layoutId - Родительский layout.
     * @param childId - Дочерний компонент для удаления.
     * @param options - Управление историей.
     */
    removeChildFromLayout(
        this: IComponentsStore,
        layoutId: string,
        childId: string,
        options?: THistoryOptions
    ) {
        const layout = this.getComponentById(layoutId);
        const child = this.getComponentById(childId);
        if (!layout?.children || !child) {
            return;
        }

        const childRemoved = removeChildFromLayoutHelper(layout, childId);
        if (!childRemoved) {
            return;
        }

        child.parent = undefined;
        child.slotName = undefined;
        child.gridColumn = undefined;
        child.gridRow = undefined;
        child.fullWidth = false;

        if (!options?.skipHistory) {
            this.saveToHistory();
        }
    },

    /**
     * Переносит компонент в layout, сохраняя относительный порядок и сеточные параметры.
     *
     * @param layoutId - Целевой layout.
     * @param childId - Компонент, который нужно переместить.
     * @param options - Параметры позиции и сетки.
     */
    moveComponentToLayout(
        this: IComponentsStore,
        layoutId: string,
        childId: string,
        options?: TMoveComponentToLayoutOptions
    ) {
        const layout = this.getComponentById(layoutId);
        const component = this.getComponentById(childId);

        if (!layout || !isLayoutComponent(layout) || !component) {
            console.warn('[Bricks Store] Unable to move component to layout', {
                layoutId,
                childId,
            });
            return;
        }

        layout.children = layout.children || [];
        const isSameLayout = component.parent === layoutId;

        if (!isSameLayout) {
            this.detachComponentFromParent(childId, { skipHistory: true });
        }

        const currentChildren = layout.children;
        const desiredIndex =
            typeof options?.targetIndex === 'number'
                ? Math.max(0, Math.min(options.targetIndex, currentChildren.length))
                : currentChildren.length;

        if (isSameLayout) {
            const currentIndex = currentChildren.indexOf(childId);
            if (currentIndex === -1) {
                currentChildren.splice(desiredIndex, 0, childId);
            } else if (currentIndex !== desiredIndex) {
                const clampedTarget = Math.min(desiredIndex, currentChildren.length - 1);

                if (options?.swap) {
                    // Swap: меняем местами два элемента в массиве
                    const swappedId = currentChildren[clampedTarget];
                    currentChildren[clampedTarget] = childId;
                    currentChildren[currentIndex] = swappedId;

                    // Очищаем grid-позиционирование у обоих компонентов,
                    // чтобы CSS Grid расставил по порядку DOM
                    const swappedComponent = this.getComponentById(swappedId);
                    if (swappedComponent) {
                        swappedComponent.gridColumn = undefined;
                        swappedComponent.gridRow = undefined;
                    }
                } else {
                    currentChildren.splice(currentIndex, 1);
                    const adjustedIndex =
                        currentIndex < desiredIndex ? desiredIndex - 1 : desiredIndex;
                    currentChildren.splice(adjustedIndex, 0, childId);
                }
            }
        } else {
            const insertIndex = Math.max(0, Math.min(desiredIndex, currentChildren.length));
            currentChildren.splice(insertIndex, 0, childId);
            component.parent = layoutId;
            component.fullWidth = undefined;
        }

        const hasExplicitIndex = typeof options?.targetIndex === 'number';
        const isGrid = layout.componentName === 'grid';

        component.gridColumn = resolveGridProperty(
            options?.gridColumn,
            component.gridColumn,
            hasExplicitIndex,
            isGrid
        );
        component.gridRow = resolveGridProperty(
            options?.gridRow,
            component.gridRow,
            hasExplicitIndex,
            isGrid
        );

        this.saveToHistory();
    },

    /**
     * Перемещает компонент на корневой уровень канваса с возможностью указать позицию.
     *
     * @param childId - Компонент, который нужно вынести на верхний уровень.
     * @param targetIndex - Позиция среди корневых элементов.
     * @param options - Настройки записи в историю.
     */
    moveComponentToRoot(
        this: IComponentsStore,
        childId: string,
        targetIndex?: number | null,
        options?: THistoryOptions
    ) {
        const componentIndex = this.components.findIndex((component) => component.id === childId);
        if (componentIndex === -1) {
            console.warn('[Bricks Store] moveComponentToRoot: component not found', childId);
            return;
        }

        const component = this.components[componentIndex];

        if (component.parent) {
            this.detachComponentFromParent(childId, { skipHistory: true });
        }

        component.parent = undefined;
        component.gridColumn = undefined;
        component.gridRow = undefined;
        component.fullWidth = false;

        const [removedComponent] = this.components.splice(componentIndex, 1);
        if (!removedComponent) {
            return;
        }

        const rootComponents = this.components.filter((item) => !item.parent);
        let insertIndex = this.components.length;

        if (typeof targetIndex === 'number') {
            const clamped = Math.max(0, Math.min(targetIndex, rootComponents.length));
            if (clamped === rootComponents.length) {
                insertIndex = this.components.length;
            } else {
                const siblingId = rootComponents[clamped]?.id;
                const siblingIndex = this.components.findIndex((item) => item.id === siblingId);
                insertIndex = siblingIndex === -1 ? this.components.length : siblingIndex;
            }
        }

        this.components.splice(insertIndex, 0, removedComponent);

        if (!options?.skipHistory) {
            this.saveToHistory();
        }
    },

    /**
     * Возвращает все компоненты верхнего уровня (без родителя).
     */
    getRootComponents(this: IComponentsStore): BricksComponent[] {
        return this.components.filter((component) => !component.parent);
    },
};
