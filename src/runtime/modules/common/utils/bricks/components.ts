import type {
    IComponentSlotDefinition,
    IBricksComponent,
    IBricksComponentSlot,
} from '../../types/brick';

/**
 * A `JSON.stringify` replacer that cuts the own key `__proto__` out at any depth.
 * A schema arrives from the API and from hand-imported JSON, and `JSON.parse`
 * creates such an own key as a matter of course. It is unrepresentable in a Nuxt
 * payload: devalue throws "Cannot stringify objects with `__proto__` keys", that is,
 * a single such key in the props brings down the SSR of both the builder and the
 * published page. It is dropped in a single place — where a schema enters the store.
 *
 * @param key - Name of the current key.
 * @param value - Value at that key.
 * @returns The value, or undefined — then the key does not reach the result.
 */
function omitProtoKey(key: string, value: unknown): unknown {
    return key === '__proto__' ? undefined : value;
}

/**
 * Creates a copy of a props object for safe use in the history and in drag & drop.
 *
 * @param props - Source props object.
 * @returns A deep copy that keeps no references and no `__proto__` own keys.
 */
export function cloneComponentProps<T extends object>(props: T | undefined): T {
    if (!props) {
        return {} as T;
    }

    return JSON.parse(JSON.stringify(props, omitProtoKey)) as T;
}

/**
 * Creates a slot description out of the incoming data.
 *
 * @param slot - Source description from the brick.
 * @returns The slot structure with empty children.
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
 * Creates a deep copy of a component slot.
 *
 * @param slot - Slot stored on the component.
 * @returns A fully independent copy of the slot.
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
 * Creates a deep copy of a canvas component.
 *
 * @param component - Component that has to be cloned.
 * @returns A clone with independent references for props, children and slots.
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
 * Checks whether the component is a layout.
 *
 * @param component - Canvas component.
 * @returns true if `type === 'layout'`.
 */
export function isLayoutComponent(component: IBricksComponent | undefined): boolean {
    return Boolean(component && component.type === 'layout');
}

/**
 * Removes a child component from the children list of a layout component.
 *
 * @param layout - Parent layout.
 * @param childId - ID of the child component.
 * @returns true if the removal happened.
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
