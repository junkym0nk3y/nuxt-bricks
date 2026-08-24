/**
 * The import of existing files from the publication storage into the media
 * database — the handler of POST /api/bricks/media/import, an administrator
 * operation over the whole managed prefix at once.
 */
import { useBricksPublishAdapter, useBricksStorageAdapter } from '../registry';
import { isMediaVariantFilename } from './mediaVariants';
import {
    MEDIA_SNIFF_BYTES,
    MEDIA_SVG_CONTENT_MAX_BYTES,
    resolveStoredMediaMime,
} from './mediaFormats';
import { sanitizeSvgMarkup } from '../../../common/utils/sanitize/sanitizeSvg';
import type { IMediaItem } from '../../../common/types/media';
import type { ICreateMediaPayload, IPublishAdapter, IStoredFileInfo } from '../../types/adapters';

/**
 * The marker of an SVG that does not fit the limit: telling it apart from "there
 * is no markup" matters, because the file is skipped instead of being registered
 * with an empty preview.
 */
const OVERSIZED_SVG = Symbol('oversized-svg');

/**
 * Reads the markup of an SVG out of storage.
 *
 * Through the adapter and not over the public URL, for the same reason the head
 * is: the object need not be public, and the bound on what is read belongs to
 * whoever owns the storage contract. A failure of the read is NOT swallowed here
 * — it goes out and refuses the whole reading phase. A swallowed one used to
 * register the file with an empty `svgContent`, and that record was permanent: a
 * repeated import returns the existing row on a url conflict without updating it,
 * so a momentary timeout left the vector broken for good.
 *
 * One byte over the limit is requested on purpose: the read returns at most what
 * was asked for, so a longer file is indistinguishable from one of exactly the
 * limit's length, and a truncated SVG is broken markup.
 *
 * @param publish - The publication storage.
 * @param file - The file's description from the publish adapter.
 * @returns The markup, or the OVERSIZED_SVG marker.
 */
async function readSvgMarkup(
    publish: Pick<IPublishAdapter, 'readFileHead'>,
    file: IStoredFileInfo
): Promise<string | typeof OVERSIZED_SVG> {
    const content = await publish.readFileHead(file.key, MEDIA_SVG_CONTENT_MAX_BYTES + 1);

    if (content.length > MEDIA_SVG_CONTENT_MAX_BYTES) {
        console.warn(
            `[Media Import] SVG content exceeds ${MEDIA_SVG_CONTENT_MAX_BYTES} bytes, skipping:`,
            file.key
        );

        return OVERSIZED_SVG;
    }

    return content.toString('utf8');
}

/**
 * Builds a media record's payload from a file's description from storage.
 *
 * The type is decided by the head of the content and not by the name: a bucket
 * filled by someone else is untrusted input, and the name is the part of it that
 * is free to lie. It is the name-based decision that used to declare an imported
 * video an `image/png` (the client picks the way of showing a file by the MIME,
 * so a video was drawn as a picture), and it also decided whether to pull the
 * whole file down as an SVG — that is, an arbitrary object called `*.svg` sent
 * the import off to fetch and sanitize it.
 *
 * @param publish - The publication storage (the content of the object is read
 * through it).
 * @param file - The file's description from the publish adapter.
 * @returns The payload for creating a media record, or null when the object is
 * not to be registered at all.
 */
async function buildImportPayload(
    publish: Pick<IPublishAdapter, 'readFileHead'>,
    file: IStoredFileInfo
): Promise<ICreateMediaPayload | null> {
    const filename = file.key.split('/').pop() || file.key;
    const head = await publish.readFileHead(file.key, MEDIA_SNIFF_BYTES);
    const mimeType = resolveStoredMediaMime(filename, head);

    if (!mimeType) {
        // A record with an honest `application/octet-stream` would be worse than
        // no record at all: the library shows everything that is not `video/*` as
        // an image, so the object would take a cell with a broken picture and
        // could be picked into a page
        console.warn(
            '[Media Import] Storage object is not a supported media file, skipping:',
            file.key
        );

        return null;
    }

    const svgContent = mimeType === 'image/svg+xml' ? await readSvgMarkup(publish, file) : null;

    if (svgContent === OVERSIZED_SVG) {
        return null;
    }

    return {
        url: file.url,
        filename,
        alt: '',
        size: file.size,
        mimeType,
        // The import has nowhere to take a category from: the file sits in the
        // bucket rather than in the media library
        category: null,
        // A bucket's file is untrusted input: a sanitized SVG is what gets stored
        svgContent: svgContent ? sanitizeSvgMarkup(svgContent) : null,
        uploadedAt: file.lastModified,
    };
}

/**
 * The reading phase of the import: the payloads of every file worth registering.
 *
 * Sequentially and not through `Promise.all`: an import runs over the whole
 * bucket, and a parallel pass would turn it into a burst of storage requests.
 *
 * @param publish - The publication storage.
 * @param files - The listing of the bucket.
 * @returns The payloads of the files the format was recognized for.
 */
async function buildImportPayloads(
    publish: Pick<IPublishAdapter, 'readFileHead'>,
    files: IStoredFileInfo[]
): Promise<ICreateMediaPayload[]> {
    const payloads: ICreateMediaPayload[] = [];

    for (const file of files) {
        // The downscaled variants of progressive loading are not standalone files of
        // the media library but belongings of their own full one: without this filter
        // the import from the bucket would show every picture as three records, and
        // deleting the "extra" ones would carry off the remaining one's variants
        if (isMediaVariantFilename(file.key)) {
            continue;
        }

        const payload = await buildImportPayload(publish, file);

        if (payload) {
            payloads.push(payload);
        }
    }

    return payloads;
}

/**
 * Imports the files from the publication storage into the database. Deduplication comes
 * from the contract of the idempotent `createMedia` (a unique url): registering again
 * returns the existing record, and no separate SELECT per file is needed.
 * When storage is not configured or is unreachable — returns an empty list.
 *
 * @returns The imported media records.
 */
export async function importMediaFromStorage(): Promise<IMediaItem[]> {
    const publish = useBricksPublishAdapter();
    let payloads: ICreateMediaPayload[];

    // Reading the whole bucket comes BEFORE the first write: a failure in the
    // middle of a mixed read-write pass would answer the administrator with an
    // error over a library that is already half-filled, and which files made it in
    // would be told apart by hand. A refusal of the reading phase costs nothing —
    // nothing has been written, and a repeat of the request starts over
    try {
        payloads = await buildImportPayloads(publish, await publish.listFiles());
    } catch (error) {
        console.warn('[Media Import] Storage is not readable, skipping import:', error);

        return [];
    }

    const storage = useBricksStorageAdapter();
    const importedItems: IMediaItem[] = [];

    for (const payload of payloads) {
        importedItems.push(await storage.createMedia(payload));
    }

    return importedItems;
}
