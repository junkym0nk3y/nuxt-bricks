/**
 * Normalization of a media item out of an API response.
 *
 * Kept out of the store: this is a pure coercion of data with a rule of its own for
 * every field, and holding those among the actions of the store would hide the
 * contract of the response inside the work with the network.
 */

// Types
import type { IMediaItem } from '../../../common/types/media';

// Utils
import { toCamelCase } from '../../../common/utils/case-transform';

const DEFAULT_MEDIA_MIME_TYPE = 'image/png';

/**
 * Normalizes a media item out of an API response.
 *
 * The keys go through `toCamelCase` (the reason lives in
 * `common/utils/case-transform.ts`): the built-in PostgreSQL adapter aliases them
 * in the SELECT already, but an external backend is free to answer in snake_case.
 *
 * @param rawItem - Media data from the API (possibly in snake_case).
 * @returns The normalized media item, in camelCase.
 */
export function normalizeMediaItem(rawItem: IMediaItem): IMediaItem {
    const item = toCamelCase<IMediaItem>(rawItem);

    return {
        ...item,
        alt: item.alt ?? '',
        // An empty string from an external backend means the same as "no category"
        category: item.category || null,
        mimeType: item.mimeType || DEFAULT_MEDIA_MIME_TYPE,
        // An external backend is free not to answer with these fields at all, and
        // `undefined` is neither of the two states the type allows. The dimensions
        // get `??`: a zero that did arrive is a value rather than "unknown", and
        // whether it is usable is the consumer's call
        width: item.width ?? null,
        height: item.height ?? null,
        // The variants get `||` instead: an empty string means their absence here,
        // and it would not stay harmless — the consumer takes `previewUrl ?? url`,
        // so `''` would reach `<img src="">`, a request for the page itself instead
        // of a picture, and a broken tile
        previewUrl: item.previewUrl || null,
        mockUrl: item.mockUrl || null,
    };
}
