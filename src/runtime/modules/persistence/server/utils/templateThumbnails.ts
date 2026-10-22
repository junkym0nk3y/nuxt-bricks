/**
 * The lifecycle of a template's preview files in the publication storage.
 *
 * A template has a file OF ITS OWN, copied out of a page's frame, rather than a link
 * to that frame. The reason is not tidiness: a page's frames live by its keep list
 * (the page + its versions, see `pageThumbnails.ts`), and a link from a template is
 * invisible to that sweep — the very first save of the page that pushed the frame out
 * of the history would leave the template's card with a broken picture.
 *
 * The template's key (`template-<uuid>.webp`) sits in the same thumbnail namespace
 * but under a different name: the page's sweep enumerates only the prefixes
 * `page-<id>-`/`page-<id>.`, so the templates' files are invisible to it entirely.
 *
 * The dependencies are passed as a parameter (narrow Pick contracts) — the logic is
 * unit-tested without a real S3 (the `avatarFiles.ts` pattern).
 */
import { randomUUID } from 'node:crypto';
import type { IPublishAdapter } from '../../types/adapters';
import type { IFileDeleteOptions } from '../../types/fileDeletion';

// Utils
import { deleteFileBestEffort } from './bestEffortDelete';
import { sniffImageFormat, type TSniffedImageFormat } from './fileSignatures';
import { collectWebStreamWithLimit } from './requestBodyLimits';

/** The size ceiling of the copied frame (MB): a page's preview is a webp ≤480px. */
const MAX_THUMBNAIL_COPY_MB = 10;
const MAX_THUMBNAIL_COPY_BYTES = MAX_THUMBNAIL_COPY_MB * 1024 * 1024;

/** The ceiling on waiting for storage while copying the frame (ms). */
const THUMBNAIL_COPY_TIMEOUT_MS = 10_000;

/** MIME by the recognized raster format: storage's content-type is no authority. */
const THUMBNAIL_MIME_TYPES: Partial<Record<TSniffedImageFormat, string>> = {
    webp: 'image/webp',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    avif: 'image/avif',
};

/**
 * Builds the object key for a new template preview file.
 *
 * The name carries no template id: the file is copied BEFORE the row is inserted (the
 * id does not exist yet), and the uuid makes the key unique on its own. The
 * "file → template" link is held by the `thumbnail_url` column, and it is also the
 * single source for the sweep.
 *
 * @param publish - The publish adapter (the source of the namespace prefix).
 * @returns The full object key.
 */
export function buildTemplateThumbnailKey(publish: Pick<IPublishAdapter, 'buildFileKey'>): string {
    return publish.buildFileKey('thumbnail', `template-${randomUUID()}.webp`);
}

/**
 * Copies a page's frame into the template's own file.
 *
 * Best-effort: a preview is a secondary artifact, and a failed copy must
 * leave the template without a picture rather than cancel its save (the card draws a
 * placeholder — a state that is provided for). That is why the outcome is
 * `string | null` rather than an exception.
 *
 * There are two checks, and both are mandatory. `isOwnedUrl` is anti-SSRF: the URL
 * comes from the request body, and without it the handler would pull an arbitrary
 * host (localhost, cloud metadata) with a server-side fetch. The magic bytes —
 * because the source can return anything under any content-type, while the file that
 * goes into the bucket will later be shown in the interface.
 *
 * @param publish - The storage's publish adapter.
 * @param sourceUrl - The page frame's URL; null/empty — there is nothing to copy.
 * @returns The URL of the template's own file, or null.
 */
export async function copyThumbnailForTemplate(
    publish: Pick<IPublishAdapter, 'buildFileKey' | 'uploadFile' | 'isOwnedUrl'>,
    sourceUrl: string | null | undefined
): Promise<string | null> {
    if (!sourceUrl) {
        return null;
    }

    try {
        if (!publish.isOwnedUrl(sourceUrl)) {
            console.warn('[Template Thumbnails] Refused to copy a foreign thumbnail:', sourceUrl);
            return null;
        }

        const response = await fetch(sourceUrl, {
            redirect: 'error',
            signal: AbortSignal.timeout(THUMBNAIL_COPY_TIMEOUT_MS),
        });

        if (!response.ok || !response.body) {
            console.warn(
                '[Template Thumbnails] Source thumbnail is not readable:',
                sourceUrl,
                response.status
            );
            return null;
        }

        const buffer = await collectWebStreamWithLimit(
            response.body,
            MAX_THUMBNAIL_COPY_BYTES,
            () => new Error(`Thumbnail exceeds ${MAX_THUMBNAIL_COPY_MB}MB limit`)
        );
        const format = sniffImageFormat(buffer);
        const mimeType = format ? THUMBNAIL_MIME_TYPES[format] : undefined;

        if (!mimeType) {
            console.warn(
                '[Template Thumbnails] Source thumbnail is not a supported raster image:',
                sourceUrl
            );
            return null;
        }

        const uploaded = await publish.uploadFile({
            buffer,
            mimeType,
            key: buildTemplateThumbnailKey(publish),
        });

        return uploaded.url;
    } catch (error: unknown) {
        console.warn('[Template Thumbnails] Failed to copy the page thumbnail:', sourceUrl, error);
        return null;
    }
}

/**
 * Removes the preview file of a deleted template.
 *
 * Best-effort and after the row has been deleted — for the same reason as with a
 * profile photo: there is no link to the file any more, the state the user sees is
 * correct, and a storage failure must not turn a successful deletion into an error
 * there is no longer anything to retry with.
 *
 * The ownership check runs INSIDE the `try`: the default adapter's `isOwnedUrl`
 * resolves the configuration and throws over an unconfigured bucket — outside the
 * try that would give the client a 500 over a successfully deleted template.
 *
 * @param publish - The storage's publish adapter.
 * @param url - The link to the file; null/empty — there is nothing to remove.
 * @param options - Whether a failure is worth another attempt: it is when the record
 *   pointing at the file is gone, and it is not when the caller is about to answer
 *   the person with an error.
 */
export async function discardTemplateThumbnail(
    publish: Pick<IPublishAdapter, 'deleteFile' | 'isOwnedUrl'>,
    url: string | null,
    options: IFileDeleteOptions
): Promise<void> {
    if (!url) {
        return;
    }

    try {
        if (!publish.isOwnedUrl(url)) {
            return;
        }
    } catch (error: unknown) {
        console.warn(
            '[Template Thumbnails] Failed to read the address of a thumbnail:',
            url,
            error
        );
        return;
    }

    await deleteFileBestEffort(publish, url, '[Template Thumbnails] Orphaned thumbnail.', options);
}
