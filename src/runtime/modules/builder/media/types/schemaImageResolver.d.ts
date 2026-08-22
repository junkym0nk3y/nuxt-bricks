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
 * The kind of place an image comes from inside the props of a component.
 */
export type TImageSourceType = 'simple-prop' | 'gallery-item' | 'inline-segment' | 'html-img';

/**
 * Where an image sits inside a schema.
 */
export interface IImageLocation {
    componentIndex: number;
    componentId: string;
    componentName: string;
    propName: string;
    arrayIndex?: number;
    segmentIndex?: number;
    sourceType: TImageSourceType;
}

/**
 * An extracted image URL along with every place it was met in.
 */
export interface IExtractedImageUrl {
    url: string;
    locations: IImageLocation[];
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
