import type {
    IComponentSlotDefinition,
    IBricksComponent,
    IBricksComponentSlot,
} from '../../types/brick';

/**
 * Реплейсер `JSON.stringify`, вырезающий own-ключ `__proto__` на любой глубине.
 * Схема приходит из API и из импортированного руками JSON, а `JSON.parse` такой
 * own-ключ создаёт штатно. В Nuxt payload он непредставим: devalue бросает
 * «Cannot stringify objects with `__proto__` keys», то есть один такой ключ в
 * пропсах роняет SSR и билдера, и опубликованной страницы. Отбрасываем его в
 * единственной точке — на входе схемы в стор.
 *
 * @param key - Имя текущего ключа.
 * @param value - Значение по ключу.
 * @returns Значение либо undefined — тогда ключ в результат не попадает.
 */
function omitProtoKey(key: string, value: unknown): unknown {
    return key === '__proto__' ? undefined : value;
}

/**
 * Создаёт копию объекта пропсов для безопасного использования в истории/драг&дропе.
 *
 * @param props - Исходный объект пропсов.
 * @returns Глубокая копия без сохранения ссылок и без own-ключей `__proto__`.
 */
export function cloneComponentProps<T extends object>(props: T | undefined): T {
    if (!props) {
        return {} as T;
    }

    return JSON.parse(JSON.stringify(props, omitProtoKey)) as T;
}

/**
 * Создаёт описание слота на основе входящих данных.
 *
 * @param slot - Исходное описание из brick.
 * @returns Структура слота с пустыми children.
 */
export function createComponentSlot(slot: IComponentSlotDefinition): IBricksComponentSlot {
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
function cloneComponentSlot(slot: IBricksComponentSlot): IBricksComponentSlot {
    return {
        ...slot,
        label: slot.label ?? slot.name,
        allowMultiple: slot.allowMultiple !== false,
        children: [...slot.children],
    };
}

/**
 * Создаёт глубокую копию компонента холста.
 *
 * @param component - Компонент, который требуется клонировать.
 * @returns Клон с независимыми ссылками для props, children и slots.
 */
export function cloneBricksComponent(component: IBricksComponent): IBricksComponent {
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
export function isLayoutComponent(component: IBricksComponent | undefined): boolean {
    return Boolean(component && component.type === 'layout');
}

/**
 * Удаляет дочерний компонент из списка детей layout-компонента.
 *
 * @param layout - Родительский layout.
 * @param childId - ID дочернего компонента.
 * @returns true, если удаление произошло.
 */
export function removeChildFromLayout(layout: IBricksComponent, childId: string): boolean {
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
