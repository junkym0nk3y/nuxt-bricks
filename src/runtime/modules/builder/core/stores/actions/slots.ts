import type { IComponentSlotDefinition } from '../../../../common/types/brick';
import { applySlotDefinitions, findSlot } from '../../utils/slots';
import type { IComponentsSlotActions, IComponentsStore, THistoryOptions } from '../types';

/**
 * Оперирует слотами layout-компонентов: инициализация, добавление/удаление и перемещение детей.
 */
export const slotActions: IComponentsSlotActions = {
    /**
     * Создаёт структуру слотов у компонента согласно декларации brick-файла.
     *
     * @param componentId - Идентификатор родительского компонента.
     * @param slots - Описание слотов из brick.
     */
    initializeComponentSlots(
        this: IComponentsStore,
        componentId: string,
        slots: IComponentSlotDefinition[]
    ) {
        const component = this.getComponentById(componentId);
        if (!component || !slots?.length || component.slots?.length) {
            return;
        }

        applySlotDefinitions(component, slots, (slotName) =>
            this.components
                .filter((child) => child.parent === componentId && child.slotName === slotName)
                .map((child) => child.id)
        );
    },

    /**
     * Упрощённая обёртка над `moveComponentToSlot` для добавления элемента.
     */
    addComponentToSlot(
        this: IComponentsStore,
        parentId: string,
        slotName: string,
        childId: string,
        index?: number | null,
        options?: THistoryOptions
    ) {
        this.moveComponentToSlot(parentId, slotName, childId, index, options);
    },

    /**
     * Удаляет компонент из заданного слота, корректно очищая ссылочные поля.
     *
     * @param parentId - ID родительского компонента.
     * @param slotName - Имя слота.
     * @param childId - Компонент, который нужно удалить.
     * @param options - Настройки истории.
     */
    removeComponentFromSlot(
        this: IComponentsStore,
        parentId: string,
        slotName: string,
        childId: string,
        options?: THistoryOptions
    ) {
        const parent = this.getComponentById(parentId);
        const child = this.getComponentById(childId);

        if (!parent || !child || !parent.slots?.length) {
            return;
        }

        const slot = findSlot(parent, slotName);
        if (!slot) {
            return;
        }

        const index = slot.children.indexOf(childId);
        if (index === -1) {
            return;
        }

        slot.children.splice(index, 1);

        if (child.parent === parentId) {
            child.parent = undefined;
            child.slotName = undefined;
            child.gridColumn = undefined;
            child.gridRow = undefined;
            child.fullWidth = false;

            if (!options?.skipHistory) {
                this.saveToHistory();
            }
        }
    },

    /**
     * Переносит компонент в указанный слот с возможностью задать позицию.
     *
     * @param parentId - Родительский компонент со слотами.
     * @param slotName - Целевой слот.
     * @param childId - Компонент для перемещения.
     * @param index - Индекс вставки или `null` для добавления в конец.
     * @param options - Флаг пропуска истории.
     */
    moveComponentToSlot(
        this: IComponentsStore,
        parentId: string,
        slotName: string,
        childId: string,
        index?: number | null,
        options?: THistoryOptions
    ) {
        const parent = this.getComponentById(parentId);
        const child = this.getComponentById(childId);

        if (!parent || !child || !parent.slots?.length) {
            console.warn('[Bricks Store] moveComponentToSlot: invalid parent or slots missing');
            return;
        }

        const targetSlot = findSlot(parent, slotName);
        if (!targetSlot) {
            console.warn('[Bricks Store] moveComponentToSlot: slot not found', slotName);
            return;
        }

        this.detachComponentFromParent(childId, { skipHistory: true });

        child.parent = parentId;
        child.slotName = slotName;
        child.gridColumn = undefined;
        child.gridRow = undefined;
        child.fullWidth = targetSlot.allowMultiple === false;

        const children = targetSlot.children;

        if (typeof index === 'number') {
            const insertIndex = Math.max(0, Math.min(index, children.length));
            children.splice(insertIndex, 0, childId);
        } else {
            children.push(childId);
        }

        if (!options?.skipHistory) {
            this.saveToHistory();
        }
    },
};
