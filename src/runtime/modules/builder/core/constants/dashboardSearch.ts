/**
 * The delay before a query typed into the search field of the dashboard header is
 * applied to a list.
 *
 * One value for the pages, the accounts and the templates: the field is the same one in
 * the shared header, and a delay of its own per section would make the search feel
 * different depending on which section happens to be open.
 *
 * Not to be shared with the search of the media library (it is applied at once) or with
 * the search inside the template picker: those fields belong to their own surfaces. The
 * debounce of the history save matches only in the number, not in the meaning.
 */
export const DASHBOARD_LIST_SEARCH_DEBOUNCE_MS = 300;
