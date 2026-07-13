/**
 * Структурный контракт графа компонентов схемы страницы (аудит A-02).
 *
 * До этого сервер принимал `components: [null]`, `[42]`, `[{}]` и циклические
 * связи — public render падал runtime exception'ом либо уходил в
 * неограниченную рекурсию. Изоморфный чистый модуль (без h3/Nuxt): одна и та
 * же проверка используется серверной валидацией payload'ов (create/update,
 * restore) и импортом JSON в билдере; guard `isRenderableSchemaComponent` и
 * лимит глубины — защитными фильтрами рендера для строк БД, записанных в
 * обход контракта (или повреждённых).
 *
 * Лимиты сложности JSON-графа (глубина/узлы/размер) — отдельный слой
 * schemaPayloadValidation.ts (persistence); здесь — семантика компонентов.
 */
import type { IBricksComponent } from '../../types/brick';

// #region Constants
/** Максимальная глубина дерева компонентов (children-вложенность). */
export const MAX_COMPONENT_TREE_DEPTH = 32;

const COMPONENT_ID_MAX_LENGTH = 100;
const COMPONENT_NAME_MAX_LENGTH = 200;
const BRICK_PATH_MAX_LENGTH = 500;
/** Верхняя граница накапливаемых ошибок — диагностики достаточно, шум не нужен. */
const MAX_CONTRACT_ERRORS = 20;

const COMPONENT_TYPES = new Set(['layout', 'component']);
// #endregion

// #region Helpers
/**
 * Проверяет, что значение — plain object.
 *
 * @param value - Проверяемое значение.
 * @returns true для plain object.
 */
function isPlainRecord(value: unknown): value is Record<string, unknown> {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        return false;
    }

    const proto = Object.getPrototypeOf(value);
    return proto === Object.prototype || proto === null;
}

/**
 * Проверяет непустую строку с верхней границей длины.
 *
 * @param value - Проверяемое значение.
 * @param max - Максимальная длина.
 * @returns true для непустой строки в границах.
 */
function isNonEmptyString(value: unknown, max: number): value is string {
    return typeof value === 'string' && value.length > 0 && value.length <= max;
}

/**
 * Слот с детьми — форма IBricksComponentSlot без деталей definition.
 */
interface ISchemaSlotShape {
    name: string;
    children: string[];
}

/**
 * Проверяет форму слота: объект с именем и массивом id детей.
 *
 * @param value - Проверяемое значение.
 * @returns true для валидной формы слота.
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
 * Собирает все id детей компонента: прямые `children` + `slots[].children`.
 *
 * @param component - Компонент с валидированной формой.
 * @returns Список id детей.
 */
function collectChildIds(component: Record<string, unknown>): string[] {
    const direct = (component.children as string[] | undefined) ?? [];
    const slots = (component.slots as ISchemaSlotShape[] | undefined) ?? [];

    return [...direct, ...slots.flatMap((slot) => slot.children)];
}

/**
 * Фаза 1: валидация формы компонентов и уникальность id.
 *
 * @param components - Массив компонентов.
 * @param push - Функция добавления ошибки.
 * @returns Map компонентов по id (пусто если есть ошибки).
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
 * Фаза 2: валидация ссылок и двусторонняя согласованность.
 *
 * @param byId - Map компонентов по id.
 * @param push - Функция добавления ошибки.
 * @returns Map контейнеров по id дочерних компонентов.
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
 * Фаза 3: валидация ацикличности и глубины дерева.
 *
 * @param byId - Map компонентов по id.
 * @param push - Функция добавления ошибки.
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
 * Минимальный shape-guard компонента для рендера: plain object с непустыми
 * строковыми `id` и `componentName` (рендер обращается к ним без проверок).
 *
 * @param value - Элемент массива schema.components.
 * @returns true, если компонент безопасно рендерить.
 */
export function isRenderableSchemaComponent(value: unknown): value is IBricksComponent {
    return (
        isPlainRecord(value) &&
        isNonEmptyString(value.id, COMPONENT_ID_MAX_LENGTH) &&
        isNonEmptyString(value.componentName, COMPONENT_NAME_MAX_LENGTH)
    );
}

/**
 * Валидирует граф компонентов схемы: форму каждого компонента, уникальность
 * id, существование parent/children/slot-ссылок, двустороннюю согласованность
 * связей, ацикличность и глубину дерева. Ошибки формы возвращаются сразу
 * (проверки графа требуют валидной формы); список ограничен
 * MAX_CONTRACT_ERRORS.
 *
 * @param components - Сырое значение schema.components.
 * @returns Список ошибок (пустой = схема валидна).
 */
export function validateSchemaComponentGraph(components: readonly unknown[]): string[] {
    const errors: string[] = [];

    /**
     * Добавляет ошибку с учётом верхней границы.
     */
    function push(message: string): void {
        if (errors.length < MAX_CONTRACT_ERRORS) {
            errors.push(message);
        }
    }

    // Фаза 1: форма компонентов + уникальность id
    const byId = validateComponentShapes(components, push);

    if (errors.length > 0) {
        return errors;
    }

    // Фаза 2: ссылки и двусторонняя согласованность
    validateComponentReferences(byId, push);

    if (errors.length > 0) {
        return errors;
    }

    // Фаза 3: ацикличность parent-цепочек и глубина дерева.
    validateComponentCyclesAndDepth(byId, push);

    return errors;
}
// #endregion
