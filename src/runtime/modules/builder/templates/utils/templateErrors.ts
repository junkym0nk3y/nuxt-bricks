/**
 * Telling the refusals of the template endpoints apart by what they mean: what to show
 * under a field of the form, what to show as a toast, and what to re-read the list
 * after.
 */
// #region Imports
// Types
import type { TRequestErrorLike } from '../../../common/types/bricks-api';

// Utils
import { getBricksErrorCode } from '../../../common/utils/main';
import { isRequestTimeoutError } from '../../../common/utils/apiRequestPolicy';

// Constants
import { TEMPLATE_CONFLICT_CODES } from '../../../common/constants/templates';
// #endregion

// #region Data
/** Refusals of an operation on a template by status — what carries no code */
const TEMPLATE_ACTION_STATUS_KEYS: Record<number, string> = {
    403: 'bricks.templates.errors.insufficientRole',
    404: 'bricks.templates.errors.templateGone',
    413: 'bricks.templates.errors.tooLarge',
    503: 'bricks.templates.errors.serverBusy',
};
// #endregion

// #region Methods
/**
 * Reads the refusal status without stumbling over an empty error: everything the
 * transport threw reaches here, an aborted request with no body included.
 *
 * @param error - Request error.
 * @returns The HTTP status, or undefined.
 */
function readStatusCode(error: unknown): number | undefined {
    return ((error ?? {}) as TRequestErrorLike).statusCode;
}
// #endregion

/**
 * The name of the template is taken — the hint goes under the name field rather than
 * into the general error text: being taken concerns one field, and it is that very
 * field a person has to fix. There is nothing to check it in advance with — the list in
 * the browser is only a copy, and another editor may have taken the name.
 *
 * @param error - Request error.
 * @returns The name is already used by another template.
 */
export function isTemplateNameTakenError(error: unknown): boolean {
    return getBricksErrorCode(error) === TEMPLATE_CONFLICT_CODES.name;
}

/**
 * The message key for a refused operation on a template.
 *
 * An abort by the waiting ceiling gets a text of its own: under it the outcome of the
 * operation is unknown — the server may have applied it and failed to answer in time —
 * so "it did not work out" would be untrue. The caller re-reads the list in that case,
 * and a person sees the actual state.
 *
 * @param error - Request error.
 * @returns The i18n key of the message.
 */
export function resolveTemplateActionErrorKey(error: unknown): string {
    if (isRequestTimeoutError(error)) {
        return 'bricks.templates.errors.timeout';
    }

    const statusCode = readStatusCode(error);

    return (
        (statusCode ? TEMPLATE_ACTION_STATUS_KEYS[statusCode] : undefined) ??
        'bricks.templates.errors.actionFailed'
    );
}
