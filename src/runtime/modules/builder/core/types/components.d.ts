/**
 * Contracts of the components shared by the subdomains of the builder: whatever lives
 * in `core/components` and is mounted from more than one feature.
 */

/**
 * Props of the builder wordmark.
 *
 * There is no caption of its own here: the mark carries only the cubes, and the three
 * places that mount it (the loader, the toolbar, the dashboard) put their captions next
 * to it themselves.
 */
export interface IBuilderLogoProps {
    /** The mark does not react to hover: on a touch device there is no hover to react to */
    isTouch?: boolean;
    /** Address of the link; `null` — the mark is not a link at all */
    to?: string | null;
    target?: '_blank' | '_self';
    /** The wave repeats by itself instead of playing once on hover */
    isInfiniteAnimation?: boolean;
}
