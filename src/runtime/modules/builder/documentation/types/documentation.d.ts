/**
 * Types of the built-in documentation of the builder.
 */

/**
 * An article of the documentation, taken out of a .md file.
 */
export interface IDocArticle {
    /** Relative path of the file (the key of the glob) */
    path: string;
    /**
     * The heading from the first `# Title` line of the article. Until the headings of
     * the locale have been read it holds the fallback built from the slug — and keeps it
     * for good when the article carries no H1 or its chunk failed to arrive.
     */
    title: string;
    /** The numeric prefix the list is ordered by (01-, 02- and so on) */
    order: number;
    /** File name without the numeric prefix and the extension */
    slug: string;
}
