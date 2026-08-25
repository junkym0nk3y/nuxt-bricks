/**
 * Shared constants of page templates — a single source for the client-side validation
 * (the yup schema of the "Save as template" form), the server-side validation of the
 * DTOs (`/api/bricks/templates/**`) and the character counters in the form fields.
 */

/**
 * Bounds of a template name. The minimum is the same as for a page title: the name is
 * the only thing a template is recognized by in the grid and in the source picker, and
 * a one-character caption tells nothing there.
 */
export const TEMPLATE_NAME_MIN_LENGTH = 3;
export const TEMPLATE_NAME_MAX_LENGTH = 120;

/** Bound of a template description (in the card it is one truncated line) */
export const TEMPLATE_DESCRIPTION_MAX_LENGTH = 500;

/**
 * Machine-readable code of the 409 for a taken template name (the `data.code` of the
 * response): the name is unique by an index, and the client puts a hint under the form
 * field instead of showing the English status text.
 */
export const TEMPLATE_CONFLICT_CODES = {
    name: 'TEMPLATE_NAME_CONFLICT',
} as const;

/**
 * The number of templates at which the search appears in the source picker of a new
 * page. Below it the field would be one extra element above a list that scrolling alone
 * still covers — the same reasoning as for the page selector of the toolbar
 * (`SEARCH_VISIBLE_FROM_PAGES`).
 *
 * Tied to the height ceiling of that list: a row is 5.2rem and the ceiling is 28rem, so
 * five rows are shown whole and the sixth template is the first one to need scrolling.
 * A higher threshold left a list that already scrolled with no way to search it, so the
 * two numbers move together — changing the ceiling means changing this one.
 */
export const TEMPLATE_PICKER_SEARCH_THRESHOLD = 6;
