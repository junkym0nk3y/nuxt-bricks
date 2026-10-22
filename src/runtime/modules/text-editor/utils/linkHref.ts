/**
 * Normalization and validation of the link address typed into the text editor modal.
 * Pure functions, no DOM — the same policy the render sanitizer applies
 * (`common/utils/sanitize/urlPolicy`), only applied on input so that the author sees
 * the rejection right away instead of discovering a stripped href on the published page.
 */

// #region Imports
// Utils
import { isSafeLinkUrl } from '../../common/utils/sanitize/urlPolicy';
// #endregion

// #region Constants
/** Scheme at the start of the value (`https:`, `mailto:`, `javascript:`) */
const SCHEME_PREFIX = /^[a-z][a-z0-9+.-]*:/i;

/** Protocol appended to a bare domain (`example.com` → `https://example.com`) */
const DEFAULT_SCHEME = 'https://';

/**
 * rel for links opened in a new tab. `noopener` cuts the opened page off from
 * `window.opener`, `noreferrer` cuts off the leak of the source address.
 */
export const NEW_TAB_LINK_REL = 'noopener noreferrer';
// #endregion

// #region Utils
/**
 * Brings the typed address to a form that survives the render sanitizer.
 * A bare domain gets `https://` — otherwise `example.com` would be read as a
 * relative path and would point at a non-existent page of the site itself.
 *
 * @param raw - Value of the input field as is.
 * @returns Normalized address, or null when the link policy forbids it.
 */
export function normalizeLinkHref(raw: string): string | null {
    const trimmed = raw.trim();

    if (!trimmed) {
        return null;
    }

    const hasExplicitTarget =
        SCHEME_PREFIX.test(trimmed) || trimmed.startsWith('#') || trimmed.startsWith('/');
    const candidate = hasExplicitTarget ? trimmed : `${DEFAULT_SCHEME}${trimmed}`;

    return isSafeLinkUrl(candidate) ? candidate : null;
}
// #endregion
