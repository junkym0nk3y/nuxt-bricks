/**
 * Итеративный (без рекурсии) обход JSON-графа `schema` до `JSON.stringify`.
 *
 * `JSON.parse` итеративен и спокойно разбирает даже 20k-уровневую вложенность,
 * а `JSON.stringify` — рекурсивен и падает `RangeError: Maximum call stack
 * size exceeded` на глубоко вложенном, но небольшом по размеру payload —
 * вместо контролируемого 400 клиент получал 500. Обход ограничивает глубину,
 * число узлов и допустимые типы значений ещё до попытки сериализации.
 * Скетч обхода — remediation-план Codex §R0.2, принят спринтом as-is (явный
 * стек вместо рекурсии, cycle-guard через `Set` по идентичности объекта).
 *
 * Строгий component-shape контракт (id/componentName/type/…, ссылки,
 * ацикличность) — отдельный изоморфный модуль `validateSchemaComponentGraph`
 * (common/utils/bricks/schemaContract.ts), подключается
 * `payloadValidation.ts` после лимитов сложности этого модуля.
 */
import { invalid } from './payloadPrimitives';

// #region Constants
/** Максимальная глубина вложенности JSON-графа schema. */
export const MAX_SCHEMA_DEPTH = 64;
/** Максимальное число JSON-узлов (объектов/массивов/примитивов) в schema. */
export const MAX_SCHEMA_NODES = 100_000;
/** Лимит сериализованного размера schema в байтах UTF-8 (не в UTF-16-символах). */
const MAX_SCHEMA_JSON_BYTES = 2 * 1024 * 1024;
// #endregion

// #region Types
/** Узел стека обхода: значение + его глубина относительно корня schema. */
interface ISchemaTraversalNode {
    value: unknown;
    depth: number;
}
// #endregion

// #region Helpers
/**
 * Проверяет, что значение — plain object (не массив, не `null`, не instance
 * класса/`Date`/`Map` и т.п.).
 *
 * @param value - Проверяемое значение.
 * @returns `true`, если значение — plain object.
 */
function isPlainRecord(value: unknown): value is Record<string, unknown> {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        return false;
    }

    const proto = Object.getPrototypeOf(value);
    return proto === Object.prototype || proto === null;
}

/**
 * Отклоняет значения, не являющиеся JSON-примитивами: разрешены `null`,
 * `string`, конечное `number` и `boolean`. `Date`, `Map`, class instances,
 * `undefined`, функции и символы сюда не доходят (отсеяны раньше в
 * `isPlainRecord`/`Array.isArray`), но сам примитив ещё может оказаться
 * нефинитным числом или неподдерживаемым типом.
 *
 * @param value - Проверяемое значение.
 */
function assertJsonPrimitive(value: unknown): void {
    if (value === null || typeof value === 'string' || typeof value === 'boolean') {
        return;
    }

    if (typeof value === 'number') {
        if (!Number.isFinite(value)) {
            invalid('Schema must not contain non-finite numbers');
        }
        return;
    }

    invalid('Schema must contain only JSON-compatible values');
}
// #endregion

// #region Traversal
/**
 * Итеративно обходит JSON-граф `schema` (явный стек, без рекурсии) и
 * ограничивает глубину, число узлов и допустимые типы значений, затем
 * проверяет сериализованный размер в байтах UTF-8 — всё до `JSON.stringify`
 * основного значения, которое иначе рекурсивно падает на глубоко вложенных
 * payload раньше любой проверки размера.
 *
 * @param schema - Разобранное (уже прошедшее `JSON.parse`) значение поля schema.
 */
export function assertSchemaComplexity(schema: unknown): void {
    const stack: ISchemaTraversalNode[] = [{ value: schema, depth: 0 }];
    const seen = new Set<object>();
    let nodes = 0;

    while (stack.length > 0) {
        const current = stack.pop() as ISchemaTraversalNode;
        nodes += 1;

        if (nodes > MAX_SCHEMA_NODES) {
            invalid(`Schema exceeds ${MAX_SCHEMA_NODES} nodes limit`);
        }

        if (current.depth > MAX_SCHEMA_DEPTH) {
            invalid(`Schema exceeds ${MAX_SCHEMA_DEPTH} depth limit`);
        }

        if (Array.isArray(current.value)) {
            if (seen.has(current.value)) {
                invalid('Schema must not contain cycles');
            }
            seen.add(current.value);

            for (const child of current.value) {
                stack.push({ value: child, depth: current.depth + 1 });
            }
            continue;
        }

        if (isPlainRecord(current.value)) {
            if (seen.has(current.value)) {
                invalid('Schema must not contain cycles');
            }
            seen.add(current.value);

            for (const child of Object.values(current.value)) {
                stack.push({ value: child, depth: current.depth + 1 });
            }
            continue;
        }

        assertJsonPrimitive(current.value);
    }

    const json = JSON.stringify(schema);
    if (Buffer.byteLength(json, 'utf8') > MAX_SCHEMA_JSON_BYTES) {
        invalid('Schema payload is too large');
    }
}
// #endregion
