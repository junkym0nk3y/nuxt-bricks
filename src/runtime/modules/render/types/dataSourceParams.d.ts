/**
 * Contract of the URL parameters of a data source: what a resolved value is
 * allowed to be, and what building a URL out of a template reports back.
 */

/**
 * Value a resolved parameter may carry into a URL.
 *
 * The set is the JSON scalars whose string form is unambiguous. Everything else
 * a brick file could return (an object, an array, a function, a symbol, a
 * bigint, `NaN`, `Infinity`) has no meaning inside a URL: `String(...)` turns an
 * object into `[object Object]` and a function into its own source text, and
 * such a request goes out looking legitimate.
 */
export type TDataSourceUrlParamValue = string | number | boolean;

/** Result of substituting parameters into a data source URL template. */
export interface IDataSourceUrlBuildResult {
    /** The template with every resolved placeholder substituted. */
    url: string;
    /**
     * Placeholders left without a value: the source has to be skipped rather
     * than requested. The keys are needed by the log — the placeholder itself
     * stays in the URL and reveals nothing about which parameter failed.
     */
    unresolvedParamKeys: string[];
}
