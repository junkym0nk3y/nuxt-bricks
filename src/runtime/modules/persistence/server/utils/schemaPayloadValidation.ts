/**
 * An iterative (non-recursive) walk over the `schema` JSON graph ahead of
 * `JSON.stringify`.
 *
 * `JSON.parse` is iterative and calmly parses even a 20k-level nesting, while
 * `JSON.stringify` is recursive and fails with `RangeError: Maximum call stack size
 * exceeded` over a deeply nested payload that is small in size — instead of a
 * controlled 400 the client got a 500. The walk bounds the depth, the node count and
 * the allowed value types before the serialization is even attempted. The walk's
 * design is an explicit stack instead of recursion, with a cycle guard through a `Set`
 * keyed by object identity.
 *
 * The strict component-shape contract (id/componentName/type/…, the references,
 * acyclicity) is a separate isomorphic module `validateSchemaComponentGraph`
 * (common/utils/bricks/schemaContract.ts), applied by `payloadValidation.ts` after
 * this module's complexity limits.
 */
import { invalid } from './payloadPrimitives';

// #region Constants
/** The maximum nesting depth of the schema's JSON graph. */
export const MAX_SCHEMA_DEPTH = 64;
/** The maximum number of JSON nodes (objects/arrays/primitives) in a schema. */
export const MAX_SCHEMA_NODES = 100_000;
/**
 * The limit on a schema's serialized size in UTF-8 bytes (not in UTF-16 characters).
 */
const MAX_SCHEMA_JSON_BYTES = 2 * 1024 * 1024;
// #endregion

// #region Types
/** A node of the walk's stack: the value + its depth relative to the schema's root. */
interface ISchemaTraversalNode {
    value: unknown;
    depth: number;
}
// #endregion

// #region Helpers
/**
 * Checks that the value is a plain object (not an array, not `null`, not an instance of
 * a class/`Date`/`Map` and the like).
 *
 * @param value - The value being checked.
 * @returns `true` when the value is a plain object.
 */
function isPlainRecord(value: unknown): value is Record<string, unknown> {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        return false;
    }

    const proto = Object.getPrototypeOf(value);
    return proto === Object.prototype || proto === null;
}

/**
 * Rejects the values that are not JSON primitives: `null`, a `string`, a finite
 * `number` and a `boolean` are allowed. `Date`, `Map`, class instances, `undefined`,
 * functions and symbols do not reach here (they are filtered out earlier in
 * `isPlainRecord`/`Array.isArray`), but the primitive itself can still turn out to be
 * a non-finite number or an unsupported type.
 *
 * @param value - The value being checked.
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
 * Iteratively walks the `schema` JSON graph (an explicit stack, no recursion) and
 * bounds the depth, the node count and the allowed value types, then checks the
 * serialized size in UTF-8 bytes — all of it ahead of the `JSON.stringify` of the main
 * value, which otherwise fails recursively over deeply nested payloads before any size
 * check.
 *
 * @param schema - The parsed (already through `JSON.parse`) value of the schema field.
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
