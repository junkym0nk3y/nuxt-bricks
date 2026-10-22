/**
 * Structural contract of the component graph of a page schema.
 *
 * Before it, the server accepted `components: [null]`, `[42]`, `[{}]` and
 * cyclic links — the public render either crashed with a runtime exception or
 * went into unbounded recursion. An isomorphic pure module (no h3/Nuxt): the
 * very same check is used by the server-side validation of the payloads
 * (create/update, restore) and by the JSON import in the builder, while the
 * `isRenderableSchemaComponent` guard and the depth limit are used as the
 * render's defensive filters for database rows written bypassing the contract
 * (or corrupted).
 *
 * The complexity limits of the JSON graph (depth/nodes/size) are a separate
 * layer, schemaPayloadValidation.ts (persistence); here it is the semantics of
 * the components.
 */
import type { IBricksComponent } from '../../types/brick';

// #region Constants
/** Maximum depth of the component tree (children nesting) */
export const MAX_COMPONENT_TREE_DEPTH = 32;

const COMPONENT_ID_MAX_LENGTH = 100;
const COMPONENT_NAME_MAX_LENGTH = 200;
const BRICK_PATH_MAX_LENGTH = 500;
/** Upper bound on the accumulated errors — enough for diagnostics, the noise is not needed */
const MAX_CONTRACT_ERRORS = 20;

const COMPONENT_TYPES = new Set(['layout', 'component']);
// #endregion

// #region Helpers
/**
 * Checks that the value is a plain object.
 *
 * @param value - Value being checked.
 * @returns true for a plain object.
 */
function isPlainRecord(value: unknown): value is Record<string, unknown> {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        return false;
    }

    const proto = Object.getPrototypeOf(value);
    return proto === Object.prototype || proto === null;
}

/**
 * Checks a non-empty string against an upper length bound.
 *
 * @param value - Value being checked.
 * @param max - Maximum length.
 * @returns true for a non-empty string within the bounds.
 */
function isNonEmptyString(value: unknown, max: number): value is string {
    return typeof value === 'string' && value.length > 0 && value.length <= max;
}

/**
 * A slot with children — the shape of IBricksComponentSlot without the
 * definition details.
 */
interface ISchemaSlotShape {
    name: string;
    children: string[];
}

/**
 * Checks the shape of a slot: an object with a name and an array of child ids.
 *
 * @param value - Value being checked.
 * @returns true for a valid slot shape.
 */
function isValidSlotShape(value: unknown): value is ISchemaSlotShape {
    return (
        isPlainRecord(value) &&
        isNonEmptyString(value.name, COMPONENT_NAME_MAX_LENGTH) &&
        Array.isArray(value.children) &&
        value.children.every((child) => isNonEmptyString(child, COMPONENT_ID_MAX_LENGTH))
    );
}

/**
 * Collects all the child ids of a component: the direct `children` +
 * `slots[].children`.
 *
 * @param component - Component whose shape has been validated.
 * @returns List of child ids.
 */
function collectChildIds(component: Record<string, unknown>): string[] {
    const direct = (component.children as string[] | undefined) ?? [];
    const slots = (component.slots as ISchemaSlotShape[] | undefined) ?? [];

    return [...direct, ...slots.flatMap((slot) => slot.children)];
}

/**
 * Phase 1: validation of the component shapes and of id uniqueness.
 *
 * @param components - Array of components.
 * @param push - Function that appends an error.
 * @returns Map of components by id (empty if there are errors).
 */
function validateComponentShapes(
    components: readonly unknown[],
    push: (message: string) => void
): Map<string, Record<string, unknown>> {
    const byId = new Map<string, Record<string, unknown>>();

    components.forEach((item, index) => {
        if (!isPlainRecord(item)) {
            push(`components[${index}] must be an object`);
            return;
        }

        if (!isNonEmptyString(item.id, COMPONENT_ID_MAX_LENGTH)) {
            push(`components[${index}].id must be a non-empty string`);
            return;
        }

        const id = item.id;

        if (byId.has(id)) {
            push(`Duplicate component id "${id}"`);
            return;
        }
        byId.set(id, item);

        if (!isNonEmptyString(item.componentName, COMPONENT_NAME_MAX_LENGTH)) {
            push(`Component "${id}": componentName must be a non-empty string`);
        }

        if (!isNonEmptyString(item.brickPath, BRICK_PATH_MAX_LENGTH)) {
            push(`Component "${id}": brickPath must be a non-empty string`);
        }

        if (item.type !== undefined && !COMPONENT_TYPES.has(item.type as string)) {
            push(`Component "${id}": type must be "layout" or "component"`);
        }

        if (item.props !== undefined && !isPlainRecord(item.props)) {
            push(`Component "${id}": props must be an object`);
        }

        if (
            item.parent !== undefined &&
            item.parent !== null &&
            !isNonEmptyString(item.parent, COMPONENT_ID_MAX_LENGTH)
        ) {
            push(`Component "${id}": parent must be a component id`);
        }

        if (
            item.children !== undefined &&
            (!Array.isArray(item.children) ||
                !item.children.every((child) => isNonEmptyString(child, COMPONENT_ID_MAX_LENGTH)))
        ) {
            push(`Component "${id}": children must be an array of component ids`);
        }

        if (
            item.slots !== undefined &&
            (!Array.isArray(item.slots) || !item.slots.every(isValidSlotShape))
        ) {
            push(`Component "${id}": slots must be an array of named slots with children ids`);
        }
    });

    return byId;
}

/**
 * Phase 2: validation of the references and of their two-way consistency.
 *
 * @param byId - Map of components by id.
 * @param push - Function that appends an error.
 * @returns Map of containers by the id of their child components.
 */
function validateComponentReferences(
    byId: Map<string, Record<string, unknown>>,
    push: (message: string) => void
): Map<string, string> {
    const containerByChildId = new Map<string, string>();

    for (const [id, component] of byId) {
        for (const childId of collectChildIds(component)) {
            if (childId === id) {
                push(`Component "${id}" references itself as a child`);
            } else if (!byId.has(childId)) {
                push(`Component "${id}" references missing child "${childId}"`);
            } else if (containerByChildId.has(childId)) {
                push(`Component "${childId}" is referenced as a child more than once`);
            } else {
                containerByChildId.set(childId, id);
            }
        }

        const parent = component.parent as string | null | undefined;

        if (parent !== undefined && parent !== null) {
            if (parent === id) {
                push(`Component "${id}" is its own parent`);
            } else if (!byId.has(parent)) {
                push(`Component "${id}" references missing parent "${parent}"`);
            }
        }
    }

    for (const [id, component] of byId) {
        const parent = (component.parent as string | null | undefined) ?? null;
        const container = containerByChildId.get(id) ?? null;

        if (parent !== container && (parent === null || byId.has(parent))) {
            push(
                `Component "${id}": parent link "${parent ?? 'none'}" does not match ` +
                    `referencing container "${container ?? 'none'}"`
            );
        }
    }

    return containerByChildId;
}

/**
 * Phase 3: validation of acyclicity and of the tree depth.
 *
 * @param byId - Map of components by id.
 * @param push - Function that appends an error.
 */
function validateComponentCyclesAndDepth(
    byId: Map<string, Record<string, unknown>>,
    push: (message: string) => void
): void {
    const depthById = new Map<string, number>();

    for (const startId of byId.keys()) {
        if (depthById.has(startId)) {
            continue;
        }

        const chain: string[] = [];
        const chainSet = new Set<string>();
        let currentId: string | null = startId;

        while (currentId !== null && !depthById.has(currentId)) {
            if (chainSet.has(currentId)) {
                push(`Component graph contains a cycle involving "${currentId}"`);
                return;
            }

            chain.push(currentId);
            chainSet.add(currentId);
            currentId = (byId.get(currentId)?.parent as string | null | undefined) ?? null;
        }

        let depth = currentId === null ? -1 : (depthById.get(currentId) as number);

        for (let i = chain.length - 1; i >= 0; i -= 1) {
            depth += 1;
            depthById.set(chain[i], depth);
        }
    }

    for (const [id, depth] of depthById) {
        if (depth >= MAX_COMPONENT_TREE_DEPTH) {
            push(`Component "${id}" exceeds ${MAX_COMPONENT_TREE_DEPTH} depth limit`);
            break;
        }
    }
}
// #endregion

// #region Public API
/**
 * Minimal shape guard of a component for the render: a plain object with
 * non-empty string `id` and `componentName` (the render reads them without any
 * checks).
 *
 * @param value - Element of the schema.components array.
 * @returns true if the component is safe to render.
 */
export function isRenderableSchemaComponent(value: unknown): value is IBricksComponent {
    return (
        isPlainRecord(value) &&
        isNonEmptyString(value.id, COMPONENT_ID_MAX_LENGTH) &&
        isNonEmptyString(value.componentName, COMPONENT_NAME_MAX_LENGTH)
    );
}

/**
 * Validates the component graph of a schema: the shape of every component, id
 * uniqueness, the existence of the parent/children/slot references, the two-way
 * consistency of the links, acyclicity and the tree depth. Shape errors are
 * returned right away (the graph checks require a valid shape); the list is
 * bounded by MAX_CONTRACT_ERRORS.
 *
 * @param components - Raw value of schema.components.
 * @returns List of errors (empty = the schema is valid).
 */
export function validateSchemaComponentGraph(components: readonly unknown[]): string[] {
    const errors: string[] = [];

    /**
     * Appends an error, honoring the upper bound.
     */
    function push(message: string): void {
        if (errors.length < MAX_CONTRACT_ERRORS) {
            errors.push(message);
        }
    }

    // Phase 1: component shapes + id uniqueness
    const byId = validateComponentShapes(components, push);

    if (errors.length > 0) {
        return errors;
    }

    // Phase 2: references and their two-way consistency
    validateComponentReferences(byId, push);

    if (errors.length > 0) {
        return errors;
    }

    // Phase 3: acyclicity of the parent chains and the tree depth.
    validateComponentCyclesAndDepth(byId, push);

    return errors;
}
// #endregion
