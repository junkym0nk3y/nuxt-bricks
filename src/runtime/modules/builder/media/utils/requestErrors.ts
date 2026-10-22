/**
 * Refusals of the media requests: the shape check of a list response and the
 * coercion of an error into what is shown to the user.
 *
 * A copy of its own rather than a reuse of `publish/utils/requestErrors.ts`: media
 * is not allowed to depend on publish (the boundaries of `.dependency-cruiser.cjs`),
 * and the shared knowledge — picking the text by the method — already lives in the
 * request policy (`resolveRequestTimeoutMessageKey`), so only the wiring is
 * duplicated.
 */

// #region Imports
// Types
import type { IMediaCategoryListResponse, IMediaListResponse } from '../../../common/types/media';
import type { TTranslateFn } from '../../../common/utils/i18nLabels';

// Utils
import {
    isRequestTimeoutError,
    resolveRequestTimeoutMessageKey,
} from '../../../common/utils/apiRequestPolicy';
import {
    getBricksErrorCode,
    getBricksErrorMessage,
    isStatementTimeoutError,
} from '../../../common/utils/main';

// Constants
import {
    BRICKS_API_ERROR_CODES,
    BRICKS_STATEMENT_TIMEOUT_MESSAGE_KEY,
} from '../../../common/constants/apiErrors';
// #endregion

/**
 * Checks that a media list response has the expected shape — the envelope of
 * `isItemsEnvelope`, where the depth of the check is explained.
 *
 * @param value - Body of the list endpoint's response.
 * @returns The response is usable as a media list.
 */
export function isMediaListResponse(value: unknown): value is IMediaListResponse {
    return isItemsEnvelope(value);
}

/**
 * Checks the shape of a category list response — the same envelope as the media
 * list has.
 *
 * @param value - Body of the categories endpoint's response.
 * @returns The response is usable as a category list.
 */
export function isMediaCategoryListResponse(value: unknown): value is IMediaCategoryListResponse {
    return isItemsEnvelope(value);
}

/**
 * The shared check of the `{ success: true, items: [] }` envelope: a non-null
 * object carrying those two. Only the envelope is checked — validating every field
 * of every item is a separate job, and its absence here is deliberate.
 *
 * @param value - Body of the response.
 * @returns The envelope is recognized.
 */
function isItemsEnvelope(value: unknown): boolean {
    if (typeof value !== 'object' || value === null) {
        return false;
    }

    const response = value as { success?: unknown; items?: unknown };

    return response.success === true && Array.isArray(response.items);
}

/**
 * Picks the text of a refusal; which outcome gets which text is described at
 * `toMediaRequestError`.
 *
 * A refusal of the server is taken apart by its machine-readable code BEFORE
 * `getBricksErrorMessage`: otherwise the user would be shown the English text of
 * the status.
 *
 * @param error - The original error of the request.
 * @param method - HTTP method of the request.
 * @param translate - The translate function of the caller.
 * @param fallbackMessage - Localized message for an error that says nothing.
 * @returns The text to show to the user.
 */
function resolveMediaErrorMessage(
    error: unknown,
    method: string,
    translate: TTranslateFn,
    fallbackMessage: string
): string {
    if (isRequestTimeoutError(error)) {
        return translate(resolveRequestTimeoutMessageKey(method));
    }

    if (isStatementTimeoutError(error)) {
        return translate(BRICKS_STATEMENT_TIMEOUT_MESSAGE_KEY);
    }

    // The category could have been deleted in another tab between the list being
    // shown and the write: the server's text for that refusal is in English, while
    // the reason itself is plain to the user
    if (getBricksErrorCode(error) === BRICKS_API_ERROR_CODES.unknownMediaCategory) {
        return translate('bricks.media.categoryUnknown');
    }

    return getBricksErrorMessage(error, fallbackMessage);
}

/**
 * Coerces a refusal of a media request into what is shown to the user: a break by
 * the waiting ceiling gets an honest text (the outcome of the write is unknown), a
 * request stopped by the server's own time limit gets one of its own (that one is
 * definitely rolled back), everything else gets the message of the server or the
 * fallback that was passed in.
 *
 * The original error is kept in `cause`: by it the caller tells a break by the
 * ceiling from a refusal of the server (`isRequestTimeoutError` walks the chain),
 * and without passing it on the wrapper would destroy that classification.
 *
 * @param error - The original error of the request.
 * @param method - HTTP method of the request.
 * @param translate - The translate function of the caller.
 * @param fallbackMessage - Localized message for an error that says nothing.
 * @returns The error to show to the user.
 */
export function toMediaRequestError(
    error: unknown,
    method: string,
    translate: TTranslateFn,
    fallbackMessage: string
): Error {
    return new Error(resolveMediaErrorMessage(error, method, translate, fallbackMessage), {
        cause: error,
    });
}
