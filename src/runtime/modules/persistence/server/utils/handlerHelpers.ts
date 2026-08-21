/**
 * Shared helpers for the /api/bricks/** Nitro handlers (parse → adapter → return).
 */
import { randomUUID } from 'node:crypto';
import { createError, getHeader, getRouterParam, type H3Event } from 'h3';
import { toCamelCaseShallow } from '../../../common/utils/case-transform';
import { PAGE_CONFLICT_CODES } from '../../../common/constants/publish';
import { TEMPLATE_CONFLICT_CODES } from '../../../common/constants/templates';
import { BRICKS_API_ERROR_CODES } from '../../../common/constants/apiErrors';
import { readJsonBodyWithLimit } from './requestBodyLimits';
import {
    BricksPageAddressConflictError,
    BricksRevisionConflictError,
    BricksStatementTimeoutError,
    BricksTemplateNameConflictError,
    BricksUnknownMediaCategoryError,
} from './storageErrors';
import { BricksLastActiveAdminError, BricksUsernameTakenError } from './authErrors';

/** The strict format of a numeric id: digits only, no sign/fraction/tail ('1abc' ❌). */
const NUMERIC_ID_PATTERN = /^\d+$/;

/**
 * The JSON body limit of the editorial handlers: twice the largest valid payload
 * (the schema is bounded to 2 MB of JSON in payloadValidation) — honest requests
 * pass, giant ones are dropped ahead of buffering.
 */
const MAX_JSON_BODY_BYTES = 4 * 1024 * 1024;

/**
 * Pulls a numeric route parameter; 400 — when it is not a positive safe integer.
 *
 * @param event - The request event.
 * @param paramName - The route parameter's name (the default is 'id').
 * @returns The parameter's numeric value.
 */
export function requireNumericId(event: H3Event, paramName = 'id'): number {
    const rawId = getRouterParam(event, paramName);
    const id = rawId && NUMERIC_ID_PATTERN.test(rawId) ? Number(rawId) : Number.NaN;

    if (!Number.isSafeInteger(id) || id <= 0) {
        const label = paramName.charAt(0).toUpperCase() + paramName.slice(1);
        throw createError({
            statusCode: 400,
            statusMessage: `${label} must be a positive integer`,
        });
    }

    return id;
}

/**
 * Reads the request body (JSON, with a size limit — 413 ahead of buffering beyond
 * the limit) and normalizes the top-level keys snake_case → camelCase.
 * Nested objects (`schema` included) are left alone. Checks the "non-empty object"
 * shape only — the fields' types and bounds are checked by the
 * `payloadValidation.ts` validators in the particular handlers.
 *
 * @param event - The request event.
 * @returns The normalized request body.
 */
export async function readNormalizedBody<T>(event: H3Event): Promise<T> {
    // An unsafe request with non-JSON content (form/text) is a typical CSRF
    // vector past the preflight; an explicit application/json is required
    const contentType = getHeader(event, 'content-type') ?? '';

    if (!contentType.toLowerCase().includes('application/json')) {
        throw createError({
            statusCode: 415,
            statusMessage: 'Expected application/json body',
        });
    }

    const body = await readJsonBodyWithLimit<object>(event, MAX_JSON_BODY_BYTES);

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
        throw createError({
            statusCode: 400,
            statusMessage: 'Request body is required',
        });
    }

    return toCamelCaseShallow<T>(body);
}

/**
 * The depth of the walk along the `cause` chain while looking for a stop by the
 * server-side time limit. The adapter wraps such a refusal exactly once (a media
 * insert — into the rejected-write marker), the margin is taken for future
 * wrappers; the bound is needed so that a looped `cause` does not hang the error
 * handler.
 */
const CAUSE_LOOKUP_DEPTH = 3;

/**
 * Looks for a stop of the query by the server-side time limit in the error itself
 * and in its causes.
 *
 * The walk along the chain is needed because the adapter wraps a failed insert into
 * the rejected-write marker: without it an upload would return a generic 500
 * instead of an honest 504 with a machine-readable code, and a retry would look
 * pointless.
 *
 * @param error - The caught error.
 * @returns The time limit error found, or null.
 */
function findStatementTimeoutError(error: unknown): BricksStatementTimeoutError | null {
    let current = error;

    for (let depth = 0; depth <= CAUSE_LOOKUP_DEPTH; depth += 1) {
        if (current instanceof BricksStatementTimeoutError) {
            return current;
        }

        if (!(current instanceof Error)) {
            return null;
        }

        current = current.cause;
    }

    return null;
}

/**
 * Rethrows h3 errors as they are, logs everything else and wraps it into a 500.
 *
 * The error's internal message (pg and the adapters can carry SQL and
 * infrastructure details) is never handed outward: the client gets a generic
 * envelope with a `data.errorId`, and the full error with that same errorId goes
 * into the server log — the response and the log correlate by the identifier.
 *
 * The exception is a stop of the query by the server-side time limit: a generic 500
 * would pass it off as an internal breakage, although the cause is known and a
 * retry makes sense, so it is returned with a status of its own and a
 * machine-readable code (the text is chosen by the client). A 504 rather than a
 * 503: it is not the whole service that is unavailable — the upstream did not
 * manage to answer within the time given.
 *
 * @param error - The caught error.
 * @param fallbackMessage - The message for the 500 response.
 */
export function toHttpError(error: unknown, fallbackMessage: string): never {
    if (error && typeof error === 'object' && 'statusCode' in error) {
        throw error;
    }

    if (findStatementTimeoutError(error)) {
        console.error('[Bricks API] Query canceled by the server statement timeout:', error);

        throw createError({
            statusCode: 504,
            statusMessage: 'Database statement timeout',
            data: { code: BRICKS_API_ERROR_CODES.statementTimeout },
        });
    }

    const errorId = randomUUID();
    console.error(`[Bricks API] ${fallbackMessage} (errorId=${errorId}):`, error);

    throw createError({
        statusCode: 500,
        statusMessage: fallbackMessage,
        data: { errorId },
    });
}

/**
 * Rethrows a stop of the query by the server-side time limit as a ready HTTP
 * error; leaves every other error to the caller.
 *
 * Needed where a shared `catch` would otherwise replace it with a status of its own
 * and lose the machine-readable code: the authorization middleware answers 503 to
 * any error of the session storage, the media proxy — 500. In database mode the
 * session is read before EVERY protected request, that is, without this rethrow the
 * most likely failure path would reach the user with a foreign status and an
 * English text.
 *
 * @param error - The caught error.
 */
export function rethrowStatementTimeoutError(error: unknown): void {
    if (error instanceof BricksStatementTimeoutError) {
        toHttpError(error, 'Database statement timeout');
    }
}

/**
 * Maps the storage layer's domain conflicts (a page create/update) onto a 409 with
 * a machine-readable `data.code`; everything else goes through toHttpError.
 *
 * @param error - The caught error.
 * @param fallbackMessage - The message for the 500 response.
 */
export function toPageHttpError(error: unknown, fallbackMessage: string): never {
    if (error instanceof BricksPageAddressConflictError) {
        throw createError({
            statusCode: 409,
            // About the address rather than the name: it is the pair
            // `urlPrefix + pagename` that is unique, and the conflict could have
            // arisen from a change of the prefix alone. The wire code
            // (`PAGENAME_CONFLICT`) stays as it was — it is part of the external
            // contract
            statusMessage: 'Page with this address already exists',
            data: { code: PAGE_CONFLICT_CODES.pagename },
        });
    }

    if (error instanceof BricksRevisionConflictError) {
        throw createError({
            statusCode: 409,
            statusMessage: 'Page was modified by someone else. Refresh and try again',
            data: { code: PAGE_CONFLICT_CODES.revision },
        });
    }

    toHttpError(error, fallbackMessage);
}

/**
 * Maps a taken template name onto a 409 with a machine-readable `data.code`;
 * everything else goes through toHttpError.
 *
 * A 409 rather than a 400: there is nothing wrong with the request, it is the
 * system's state that was refused (the name is already taken by another template),
 * and by the code the client puts a hint under the form's field instead of a
 * general error text.
 *
 * @param error - The caught error.
 * @param fallbackMessage - The message for the 500 response.
 */
export function toTemplateHttpError(error: unknown, fallbackMessage: string): never {
    if (error instanceof BricksTemplateNameConflictError) {
        throw createError({
            statusCode: 409,
            statusMessage: 'Template with this name already exists',
            data: { code: TEMPLATE_CONFLICT_CODES.name },
        });
    }

    toHttpError(error, fallbackMessage);
}

/**
 * Maps a missing media category onto a 400 with a machine-readable `data.code`;
 * everything else goes through toHttpError.
 *
 * A helper of its own rather than a branch of the shared `toHttpError`: categories
 * are one domain's rule, and knowledge of it is out of place in the mapper of every
 * handler in the project. The error's source does not matter here — the handler's
 * early check and the database FK that caught a race with the category's deletion
 * give the client one and the same answer.
 *
 * @param error - The caught error.
 * @param fallbackMessage - The message for the 500 response.
 */
export function toMediaHttpError(error: unknown, fallbackMessage: string): never {
    if (error instanceof BricksUnknownMediaCategoryError) {
        throw createError({
            statusCode: 400,
            statusMessage: 'Unknown media category',
            data: { code: BRICKS_API_ERROR_CODES.unknownMediaCategory },
        });
    }

    toHttpError(error, fallbackMessage);
}

/**
 * Maps the domain refusals of account management onto a 409 with a machine-readable
 * `data.code`; everything else goes through toHttpError.
 *
 * A 409 rather than a 403: the request does have the rights, it is the system's
 * state that was refused (the last administrator, a taken username), and the client
 * shows different explanations — by the code.
 *
 * @param error - The caught error.
 * @param fallbackMessage - The message for the 500 response.
 */
export function toUsersHttpError(error: unknown, fallbackMessage: string): never {
    if (error instanceof BricksLastActiveAdminError) {
        throw createError({
            statusCode: 409,
            statusMessage: 'The last active administrator cannot be demoted, disabled or deleted',
            data: { code: BRICKS_API_ERROR_CODES.lastActiveAdmin },
        });
    }

    if (error instanceof BricksUsernameTakenError) {
        throw createError({
            statusCode: 409,
            statusMessage: 'User with this username already exists',
            data: { code: BRICKS_API_ERROR_CODES.usernameTaken },
        });
    }

    toHttpError(error, fallbackMessage);
}
