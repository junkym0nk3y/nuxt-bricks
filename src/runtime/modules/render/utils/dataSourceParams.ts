/**
 * URL parameters of a data source: the check of a resolved value and the
 * substitution into the URL template (pure functions).
 *
 * The parameters are declared in a brick file and resolved from the component
 * props or the page settings, so both sides are untrusted here: the value may
 * turn out to be anything at all, and the template may hold a colon that is not
 * a placeholder.
 */

// #region Imports
// Types
import type {
    IDataSourceUrlBuildResult,
    TDataSourceUrlParamValue,
} from '../types/dataSourceParams';
// #endregion

// #region Constants
/** Placeholder of a URL template: `:paramName`. */
const PLACEHOLDER_PATTERN = /:([a-zA-Z0-9_]+)/g;

/**
 * Start of a placeholder name in the heuristic below: a letter or `_`.
 * A name starting with a digit is what a legitimate colon looks like
 * (`?at=12:30`), so the heuristic does not claim it.
 */
const PLACEHOLDER_NAME_START_PATTERN = /^[a-zA-Z_]/;

/** Characters that close a path segment right after a placeholder. */
const PATH_SEGMENT_END_CHARS = new Set(['/', '?', '#']);

/** Characters that close a query value right after a placeholder. */
const QUERY_VALUE_END_CHARS = new Set(['&', '#']);
// #endregion

/**
 * Whether the resolved value can be carried into a URL.
 *
 * @param value - Value returned by the parameter resolution (or by the `map` of
 * a brick file).
 * @returns true for a string, a boolean and a finite number.
 */
export function isDataSourceUrlParamValue(value: unknown): value is TDataSourceUrlParamValue {
    return (
        typeof value === 'string' ||
        typeof value === 'boolean' ||
        (typeof value === 'number' && Number.isFinite(value))
    );
}

/**
 * Whether an undeclared `:name` is a placeholder beyond doubt: it occupies a
 * WHOLE path segment (`/api/users/:id`) or the WHOLE value of a query parameter
 * (`?id=:id`), and its name starts with a letter or `_`.
 *
 * The heuristic exists because a colon inside a URL is legal: `?at=12:30` is a
 * time, not a forgotten parameter, and the previous check refused such a source
 * outright. In the other direction it keeps the diagnosis for a typo in the
 * template (`:pgae` where `params` declares `page`): a whole segment cannot be
 * anything but a placeholder.
 *
 * Whole means whole on BOTH sides. `?filter=kind=:draft` is not claimed: the
 * value of `filter` is `kind=:draft`, and the colon merely sits inside it — the
 * same case as a value with a time in it. Neither is `/api/x/filter=:draft`: in
 * the path part an `=` is an ordinary character, so the placeholder does not
 * occupy the segment on its own.
 *
 * What is deliberately NOT claimed either is an undeclared placeholder glued to
 * neighboring text (`/api/x/prefix-:id`): a colon in the middle of a segment is
 * indistinguishable from a legitimate value, and such a template goes out to the
 * request as it is. Declare the parameter and it is diagnosed by name wherever
 * it stands.
 *
 * @param template - URL template of the data source.
 * @param offset - Offset of the placeholder (of the colon) in the template.
 * @param key - Placeholder name without the colon.
 * @returns true when the match cannot be anything but a placeholder.
 */
function isUnambiguousPlaceholder(template: string, offset: number, key: string): boolean {
    if (!PLACEHOLDER_NAME_START_PATTERN.test(key)) {
        return false;
    }

    const charBefore = template[offset - 1];
    // The colon plus the name: what follows the placeholder
    const charAfter = template[offset + key.length + 1];
    const queryStart = template.indexOf('?');
    const isInQuery = queryStart !== -1 && offset > queryStart;

    if (isInQuery) {
        if (charBefore !== '=') {
            return false;
        }

        // The `=` has to be the separator of the pair rather than a character of
        // the value: between the start of the pair and the separator there is no
        // second `=`
        const pairStart = Math.max(template.lastIndexOf('&', offset), queryStart) + 1;

        if (template.slice(pairStart, offset - 1).includes('=')) {
            return false;
        }

        return charAfter === undefined || QUERY_VALUE_END_CHARS.has(charAfter);
    }

    if (charBefore !== undefined && charBefore !== '/') {
        return false;
    }

    return charAfter === undefined || PATH_SEGMENT_END_CHARS.has(charAfter);
}

/**
 * Substitutes the parameters into the URL template and reports the placeholders
 * left without a value.
 *
 * The unresolved ones are collected during the substitution rather than by
 * scanning the finished string: the string no longer tells a placeholder from a
 * colon of a substituted value or of a port. Values go through
 * `encodeURIComponent`, so a colon of a value cannot appear in the result at
 * all.
 *
 * A placeholder is reported as unresolved when the parameter was DECLARED by the
 * brick file (it was meant to be substituted, and the value did not arrive) or
 * when the match cannot be anything but a placeholder — see
 * `isUnambiguousPlaceholder`.
 *
 * The names are matched by a `Map` and a `Set`: they are declared by a brick
 * file, so with an ordinary object `:constructor` would count as found via the
 * prototype, while `:__proto__` could not be represented by an own key at all.
 *
 * @param template - URL with placeholders of the `:paramName` form.
 * @param params - Resolved parameter values by name.
 * @param declaredParamKeys - Names the brick file declared in `params`,
 * regardless of whether the value arrived.
 * @returns The URL and the names of the unresolved placeholders.
 *
 * @example
 * ```ts
 * buildDataSourceUrl('/api/users/:id', new Map([['id', 123]]), new Set(['id']));
 * // { url: '/api/users/123', unresolvedParamKeys: [] }
 * ```
 */
export function buildDataSourceUrl(
    template: string,
    params: ReadonlyMap<string, TDataSourceUrlParamValue>,
    declaredParamKeys: ReadonlySet<string>
): IDataSourceUrlBuildResult {
    const unresolvedParamKeys = new Set<string>();

    const url = template.replace(PLACEHOLDER_PATTERN, (match, key: string, offset: number) => {
        if (params.has(key)) {
            return encodeURIComponent(String(params.get(key)));
        }

        if (declaredParamKeys.has(key) || isUnambiguousPlaceholder(template, offset, key)) {
            unresolvedParamKeys.add(key);
        }

        return match;
    });

    return { url, unresolvedParamKeys: [...unresolvedParamKeys] };
}
