import type {
    ComponentSlotDefinition,
    LandingComponent,
    LandingComponentSlot,
} from '../../types/landing';

/**
 * Инициализирует слоты layout-компонента на основе метаданных.
 *
 * @param component - Layout-компонент, у которого нужно заполнить слоты.
 * @param slots - Описание слотов из story.
 * @param resolveChildren - Функция, которая возвращает id дочерних элементов для слота.
 */
export function applySlotDefinitions(
    component: LandingComponent,
    slots: ComponentSlotDefinition[],
    resolveChildren?: (slotName: string) => string[]
): void {
    if (!slots?.length) {
        return;
    }

    component.slots = slots.map((slot) => ({
        name: slot.name,
        label: slot.label ?? slot.name,
        description: slot.description,
        allowMultiple: slot.allowMultiple !== false,
        children: resolveChildren ? resolveChildren(slot.name) : [],
    }));
}

/**
 * Находит слот по имени внутри layout-компонента.
 *
 * @param component - Компонент с описанными слотами.
 * @param slotName - Имя нужного слота.
 * @returns Найденный слот или undefined.
 */
export function findSlot(
    component: LandingComponent | undefined,
    slotName: string
): LandingComponentSlot | undefined {
    return component?.slots?.find((slot) => slot.name === slotName);
}
