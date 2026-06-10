import type {
    ComponentSlotDefinition,
    LandingComponent,
    LandingComponentSlot,
} from '../../types/landing';

/**
 * Создаёт копию объекта пропсов для безопасного использования в истории/драг&дропе.
 *
 * @param props - Исходный объект пропсов.
 * @returns Глубокая копия без сохранения ссылок.
 */
export function cloneComponentProps<T extends Record<string, any>>(props: T | undefined): T {
    if (!props) {
        return {} as T;
    }

    return JSON.parse(JSON.stringify(props)) as T;
}

/**
 * Создаёт описание слота на основе входящих данных.
 *
 * @param slot - Исходное описание из story.
 * @returns Структура слота с пустыми children.
 */
export function createComponentSlot(slot: ComponentSlotDefinition): LandingComponentSlot {
    return {
        ...slot,
        label: slot.label ?? slot.name,
        allowMultiple: slot.allowMultiple !== false,
        children: [],
    };
}

/**
 * Создаёт глубокую копию слота компонента.
 *
 * @param slot - Слот, сохранённый у компонента.
 * @returns Полностью независимая копия слота.
 */
export function cloneComponentSlot(slot: LandingComponentSlot): LandingComponentSlot {
    return {
        ...slot,
        label: slot.label ?? slot.name,
        allowMultiple: slot.allowMultiple !== false,
        children: [...slot.children],
    };
}

/**
 * Создаёт глубокую копию компонента landing-холста.
 *
 * @param component - Компонент, который требуется клонировать.
 * @returns Клон с независимыми ссылками для props, children и slots.
 */
export function cloneLandingComponent(component: LandingComponent): LandingComponent {
    return {
        ...component,
        props: cloneComponentProps(component.props),
        deviceVisibility: component.deviceVisibility
            ? { ...component.deviceVisibility }
            : undefined,
        children: component.children ? [...component.children] : undefined,
        slots: component.slots?.map((slot) => cloneComponentSlot(slot)),
    };
}

/**
 * Проверяет, является ли компонент layout-ом.
 *
 * @param component - Компонент Canvas.
 * @returns true, если `type === 'layout'`.
 */
export function isLayoutComponent(component: LandingComponent | undefined): boolean {
    return Boolean(component && component.type === 'layout');
}

/**
 * Удаляет дочерний компонент из списка детей layout-компонента.
 *
 * @param layout - Родительский layout.
 * @param childId - ID дочернего компонента.
 * @returns true, если удаление произошло.
 */
export function removeChildFromLayout(layout: LandingComponent, childId: string): boolean {
    if (!layout.children) {
        return false;
    }

    const childIndex = layout.children.indexOf(childId);
    if (childIndex === -1) {
        return false;
    }

    layout.children.splice(childIndex, 1);
    return true;
}
