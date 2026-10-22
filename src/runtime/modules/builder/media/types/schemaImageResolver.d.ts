/**
 * Types of the image resolution that runs when a JSON schema is imported.
 */

import type { IBricksSchema } from '../../../common/types/brick';

/**
 * What to do with an image that was found.
 * - `keep` — leave the URL as it is;
 * - `placeholder` — swap it for the placeholder image.
 */
export type TImageResolveAction = 'keep' | 'placeholder';

/**
 * An extracted image URL along with the name of the component it was first met in.
 *
 * The name alone rather than a full address of every occurrence: the row of the
 * resolver shows the block a picture came from, and the choice it offers applies to
 * the URL as a whole — the same picture in three places is one decision. A model of
 * addressing would be needed by an action over a single occurrence, and that action
 * does not exist.
 */
export interface IExtractedImageUrl {
    url: string;
    componentName: string;
}

/**
 * State of the image resolver.
 *
 * `actions` is a Map on purpose: its key comes out of the schema (the URL of a
 * picture), and `<img src="__proto__">` in an imported component would turn the
 * assignment into a call of the prototype setter, so the "swap for the placeholder"
 * choice for that picture would be silently ignored. The state is local and
 * never travels into the payload, so nothing here stands against a Map.
 */
export interface IImageResolverState {
    newImages: IExtractedImageUrl[];
    actions: Map<string, TImageResolveAction>;
    globalAction: TImageResolveAction;
}

/**
 * The deferred answer of the resolver modal: the schema with the user's choice
 * applied, or `null` (the import was canceled).
 */
export interface IResolverPromise {
    resolve: (schema: IBricksSchema | null) => void;
}

/**
 * The result of the resolution.
 *
 * `isComparisonSkipped` — the comparison against the media library did not happen
 * (its contents are unknown). The schema is then returned untouched: there is
 * nothing to split the URLs into "new" and "already known" by, and offering a choice
 * built on a false classification is worse than offering none at all.
 */
export interface IImageResolverResult {
    schema: IBricksSchema | null;
    isComparisonSkipped: boolean;
}
