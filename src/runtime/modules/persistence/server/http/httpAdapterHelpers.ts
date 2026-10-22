/**
 * Shared helpers of the external backend's HTTP adapter: normalizing the response's
 * shape and recognizing the contract statuses.
 *
 * Extracted out of `httpStorageAdapter.ts` when the media part moved into a file of
 * its own: both halves need the same primitives, and a second copy of the 404/409
 * predicates would drift away from the first at the contract's next edit.
 */
import { BricksBackendRequestError } from './httpClient';
import { toCamelCaseShallow } from '../../../common/utils/case-transform';
import { BRICKS_API_ERROR_CODES } from '../../../common/constants/apiErrors';

/**
 * Normalizes a response row from the external backend: the top-level keys
 * snake_case → camelCase, the nested values (`schema` included) unchanged.
 *
 * @param raw - The parsed response body.
 * @param context - A description of the request, for the format error's message.
 * @returns The normalized row.
 */
export function normalizeRow<T>(raw: unknown, context: string): T {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        throw new Error(`[Bricks Backend] ${context}: expected an object row in response`);
    }

    return toCamelCaseShallow<T>(raw);
}

/**
 * Normalizes an array of response rows from the external backend.
 *
 * @param raw - The parsed response body.
 * @param context - A description of the request, for the format error's message.
 * @returns The array of normalized rows.
 */
export function normalizeRows<T>(raw: unknown, context: string): T[] {
    if (!Array.isArray(raw)) {
        throw new Error(`[Bricks Backend] ${context}: expected an array in response`);
    }

    return raw.map((item) => normalizeRow<T>(item, context));
}

/**
 * Pulls the list from the response: a flat array or an `{ items: [...] }` envelope
 * (the format of the local endpoints GET /api/bricks/media and /media/categories).
 *
 * @param raw - The parsed response body.
 * @param context - A description of the request, for the format error's message.
 * @returns The array of raw records.
 */
export function unwrapItemsList(raw: unknown, context: string): unknown[] {
    if (Array.isArray(raw)) {
        return raw;
    }

    if (raw && typeof raw === 'object' && Array.isArray((raw as { items?: unknown }).items)) {
        return (raw as { items: unknown[] }).items;
    }

    throw new Error(`[Bricks Backend] ${context}: expected an array or { items: [...] } envelope`);
}

/**
 * Pulls a point lookup's answer out of the response: an `{ item: <row> | null }`
 * envelope, where `null` is the contract's "there is no such record".
 *
 * The envelope is the point of it. A bare row plus a 404 for an absence cannot tell
 * "no such record" from "the endpoint is not implemented", and a bare list would let
 * a backend that ignored the lookup hand back its whole media library — the very
 * O(N) walk the point lookup exists to remove. So a list, a bare row and a body with
 * no `item` key are all format errors rather than an absence.
 *
 * @param raw - The parsed response body.
 * @param context - A description of the request, for the format error's message.
 * @returns The raw record, or null when the backend has none.
 */
export function unwrapItemEnvelope(raw: unknown, context: string): unknown {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) || !('item' in raw)) {
        throw new Error(`[Bricks Backend] ${context}: expected an { item: … } envelope`);
    }

    return (raw as { item: unknown }).item ?? null;
}

/**
 * Checks that the error is an HTTP 404 from the external backend (the contract's "not
 * found").
 *
 * @param error - The caught request error.
 * @returns true for a 404.
 */
export function isNotFoundError(error: unknown): boolean {
    return error instanceof BricksBackendRequestError && error.upstreamStatus === 404;
}

/**
 * Checks that the error is an HTTP 409 from the external backend (a write conflict).
 *
 * @param error - The caught request error.
 * @returns true for a 409.
 */
export function isConflictError(error: unknown): error is BricksBackendRequestError {
    return error instanceof BricksBackendRequestError && error.upstreamStatus === 409;
}

/**
 * Checks that the error is the external backend's contract refusal "there is no such
 * category": a 400 WITH the machine-readable code.
 *
 * The status alone is not enough: a 400 with no code is an arbitrary validation of
 * somebody else's backend, and passing it off as a missing category would mean lying
 * to the user. For exactly the same reason such a refusal's outcome is treated as
 * determined only when the code matches — the contract obliges the backend not to
 * commit a write it answered with that code.
 *
 * @param error - The caught request error.
 * @returns true for a 400 UNKNOWN_MEDIA_CATEGORY.
 */
export function isUnknownMediaCategoryError(error: unknown): boolean {
    return (
        error instanceof BricksBackendRequestError &&
        error.upstreamStatus === 400 &&
        error.errorCode === BRICKS_API_ERROR_CODES.unknownMediaCategory
    );
}
