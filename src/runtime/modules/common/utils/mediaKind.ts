/**
 * The kind of a media library file (image, video, document) and the recognition of
 * documents — shared by the upload endpoint and the builder.
 *
 * The kind is read off the MIME type of the record rather than off the file name: the
 * server stores the canonical MIME of the recognized content, while the name is the
 * one the person typed and may be anything.
 */

// #region Imports
// Types
import type {
    IMediaGalleryPickFilter,
    IMediaItem,
    TMediaDocumentExtension,
    TMediaKind,
} from '../types/media';

// Constants
import { MEDIA_DOCUMENT_MIME_TYPES } from '../constants/mediaDocuments';
// #endregion

/** MIME prefix of a video file */
const VIDEO_MIME_PREFIX = 'video/';

/** Extension of a document by its canonical MIME type */
const DOCUMENT_EXTENSION_BY_MIME = new Map<string, TMediaDocumentExtension>(
    (Object.entries(MEDIA_DOCUMENT_MIME_TYPES) as [TMediaDocumentExtension, string][]).map(
        ([extension, mimeType]) => [mimeType, extension]
    )
);

/**
 * Whether a string is the extension of an accepted document.
 *
 * @param value - Extension in lower case, without the dot.
 */
export function isMediaDocumentExtension(value: string): value is TMediaDocumentExtension {
    return Object.hasOwn(MEDIA_DOCUMENT_MIME_TYPES, value);
}

/**
 * The extension of an accepted document by its MIME type.
 *
 * @param mimeType - MIME type of the record.
 * @returns The extension, or null when the MIME is not one of a document.
 */
export function resolveMediaDocumentExtension(mimeType: string): TMediaDocumentExtension | null {
    return DOCUMENT_EXTENSION_BY_MIME.get(mimeType) ?? null;
}

/**
 * The kind of a media library file.
 *
 * Everything that is neither a video nor a document is an image: the library held only
 * those two kinds before documents, and an unknown MIME of an old record must keep
 * reading the way it always did.
 *
 * @param mimeType - MIME type of the record.
 */
export function resolveMediaKind(mimeType: string): TMediaKind {
    if (mimeType.startsWith(VIDEO_MIME_PREFIX)) {
        return 'video';
    }

    return resolveMediaDocumentExtension(mimeType) ? 'document' : 'image';
}

/**
 * The extension of a file name or of the path of an address, in lower case.
 *
 * @param name - File name or URL; a query string and a fragment are ignored.
 * @returns The extension without the dot, or an empty string.
 */
export function readFileExtension(name: string | undefined): string {
    const path = (name ?? '').trim().split(/[?#]/, 1)[0] ?? '';
    const lastSegment = path.slice(path.lastIndexOf('/') + 1);
    const lastDotIndex = lastSegment.lastIndexOf('.');

    return lastDotIndex > 0 ? lastSegment.slice(lastDotIndex + 1).toLowerCase() : '';
}

/**
 * Whether an upload claims to be a document — by its declared MIME or by its extension.
 *
 * A claim, not a proof: the content is confirmed by its signature on the server. The
 * extension counts on its own because a browser on a machine without an office suite
 * may send an Office file with no MIME.
 *
 * @param mimeType - MIME type declared by the browser.
 * @param extension - Extension of the file name in lower case.
 */
export function isMediaDocumentFile(mimeType: string | undefined, extension: string): boolean {
    return (
        Boolean(mimeType && DOCUMENT_EXTENSION_BY_MIME.has(mimeType)) ||
        isMediaDocumentExtension(extension)
    );
}

/**
 * An extension of an `accept` list the way it is compared: the author may write `.PDF`.
 *
 * @param extension - An entry of the list.
 * @returns The extension in lower case, without the dot.
 */
export function normalizeAcceptedExtension(extension: string): string {
    return extension.trim().replace(/^\./, '').toLowerCase();
}

/**
 * Whether a library file is on offer under a pick filter.
 *
 * The extensions are compared against the address rather than against the name: the
 * stored address carries the extension of the recognized format, while the name is
 * whatever the person typed.
 *
 * @param item - The library file.
 * @param filter - The pick filter; null — every file.
 */
export function matchesMediaPickFilter(
    item: Pick<IMediaItem, 'mimeType' | 'url'>,
    filter: IMediaGalleryPickFilter | null
): boolean {
    if (!filter) {
        return true;
    }

    if (!filter.kinds.includes(resolveMediaKind(item.mimeType))) {
        return false;
    }

    if (!filter.extensions?.length) {
        return true;
    }

    const extension = readFileExtension(item.url);

    return filter.extensions.some((accepted) => normalizeAcceptedExtension(accepted) === extension);
}
