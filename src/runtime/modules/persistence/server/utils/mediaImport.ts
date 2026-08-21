/**
 * The import of existing files from the publication storage into the media database
 * (a fallback for GET /api/bricks/media over an empty bricks_media table).
 */
import { useBricksPublishAdapter, useBricksStorageAdapter } from '../registry';
import { isMediaVariantFilename } from './mediaVariants';
import { detectMimeTypeByFilename, fetchSvgContent } from './mediaProcessing';
import { sanitizeSvgMarkup } from '../../../common/utils/sanitize/sanitizeSvg';
import type { IMediaItem } from '../../../common/types/media';
import type { ICreateMediaPayload, IStoredFileInfo } from '../../types/adapters';

/**
 * Builds a media record's payload from a file's description from storage.
 *
 * @param file - The file's description from the publish adapter.
 * @returns The payload for creating a media record.
 */
async function buildImportPayload(file: IStoredFileInfo): Promise<ICreateMediaPayload> {
    const filename = file.key.split('/').pop() || file.key;
    const mimeType = detectMimeTypeByFilename(filename);
    const svgContent = mimeType === 'image/svg+xml' ? await fetchSvgContent(file.url) : undefined;

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
 * Imports the files from the publication storage into the database. Deduplication comes
 * from the contract of the idempotent `createMedia` (a unique url): registering again
 * returns the existing record, and no separate SELECT per file is needed.
 * When storage is not configured or is unreachable — returns an empty list.
 *
 * @returns The imported media records.
 */
export async function importMediaFromStorage(): Promise<IMediaItem[]> {
    let files: IStoredFileInfo[];

    try {
        files = await useBricksPublishAdapter().listFiles();
    } catch (error) {
        console.warn('[Media Import] Storage is not available, skipping import:', error);
        return [];
    }

    const storage = useBricksStorageAdapter();
    const importedItems: IMediaItem[] = [];

    for (const file of files) {
        // The downscaled variants of progressive loading are not standalone files of
        // the media library but belongings of their own full one: without this filter
        // the import from the bucket would show every picture as three records, and
        // deleting the "extra" ones would carry off the remaining one's variants
        if (isMediaVariantFilename(file.key)) {
            continue;
        }

        const payload = await buildImportPayload(file);
        importedItems.push(await storage.createMedia(payload));
    }

    return importedItems;
}
