/**
 * The lifecycle of a page's preview files in the publication storage.
 *
 * The key is unique per upload (`page-<id>-<uuid>.webp`) rather than constant per
 * page: the version gallery shows a preview of every saved state, and with a
 * single overwritten key all the versions would show the latest frame. The price
 * of uniqueness is orphans: a file stops being needed once the version referencing
 * it was pushed out by the history prune. That is why the sweep walks the page's
 * prefix with an explicit list of the URLs still needed, rather than a single key.
 *
 * The dependencies are passed as a parameter (narrow Pick contracts) — the logic
 * is unit-tested without a real S3 (the mediaOrchestration.ts pattern).
 */
import { randomUUID } from 'node:crypto';
import type {
    IPageThumbnailPruneDeps,
    IPrunePageThumbnailsOptions,
    IPublishAdapter,
} from '../../types/adapters';

/**
 * The file name prefixes of one page's previews inside the thumbnail namespace.
 *
 * There are two: `page-<id>-` — the present format with a uuid, and `page-<id>.` —
 * the former single file of a page. The second one is needed so that the former
 * frame does not stay an orphan forever: after the first save it stops being the
 * page's preview and goes into a version, and from the version into nowhere once
 * the history prune pushes that version out.
 *
 * The separator at the end is mandatory for both: without it page 1's prefix would
 * cover page 12's files.
 *
 * @param pageId - The page identifier.
 * @returns The prefix names for buildFileKey.
 */
function buildThumbnailFilenamePrefixes(pageId: number): string[] {
    return [`page-${pageId}-`, `page-${pageId}.`];
}

/**
 * Builds the object key for a new page preview file.
 *
 * @param publish - The publish adapter (the source of the namespace prefix).
 * @param pageId - The page identifier.
 * @returns The full object key.
 */
export function buildPageThumbnailKey(
    publish: Pick<IPublishAdapter, 'buildFileKey'>,
    pageId: number
): string {
    return publish.buildFileKey('thumbnail', `page-${pageId}-${randomUUID()}.webp`);
}

/**
 * Cuts the query off a file's URL: previews saved by the former scheme carry a
 * cache buster `?v=<ts>` in their URL, and without normalization such a URL would
 * not match the URL of the same object from the storage listing.
 *
 * @param url - The file's URL.
 * @returns The URL without its query and fragment.
 */
function stripUrlQuery(url: string): string {
    return url.split('#')[0].split('?')[0];
}

/**
 * The age below which a file is not deleted as an orphan (ms).
 *
 * A link to a freshly uploaded frame does not appear in the database at the moment
 * of the upload: the handler returns the URL, and the client writes it with a
 * separate PATCH. While the PATCH is in flight the file is listed nowhere — and a
 * parallel sweep from a neighboring save would take it for an orphan. Two saves in
 * a row really do produce such POSTs: the preview capture is started
 * fire-and-forget and does not hold `isSubmitting`. A sweep deferred by the window
 * loses no orphan — the next pass will take it.
 */
const RECENT_UPLOAD_GRACE_MS = 10 * 60 * 1000;

/**
 * Checks that a file was uploaded too recently to be counted as an orphan.
 *
 * @param lastModified - The ISO date of the object's last write.
 * @param graceMs - The width of the protective window.
 * @returns true when the file is younger than the window.
 */
function isRecentUpload(lastModified: string, graceMs: number): boolean {
    const modifiedAt = new Date(lastModified).getTime();

    if (Number.isNaN(modifiedAt)) {
        // Storage returned no intelligible date — treat the file as fresh and
        // leave it alone: mistakenly deleting a live frame costs more than an
        // orphan surviving the pass
        return true;
    }

    return Date.now() - modifiedAt < graceMs;
}

/**
 * Best-effort deletion of the page preview files nobody references any more:
 * everything under the page's prefixes except the ones listed in `keepUrls` and
 * except the too fresh ones (see `RECENT_UPLOAD_GRACE_MS`).
 *
 * The list of needed URLs is passed in from outside in full (the page + all of its
 * versions + the frame just uploaded) — the comparison is exact, with no "keep the
 * N freshest" heuristics.
 *
 * A preview is a secondary artifact: any error is muted into a warning and does not
 * bring the calling operation (a snapshot upload, a page deletion) down.
 *
 * @param publish - The publish adapter.
 * @param pageId - The page identifier.
 * @param keepUrls - The URLs that must not be deleted (null/undefined are ignored).
 * @param options - `includeRecentUploads` lifts the protection of fresh files; set
 * when a page is deleted, where there will be no next pass and a deferred file
 * would stay in storage forever.
 */
export async function prunePageThumbnails(
    publish: Pick<IPublishAdapter, 'buildFileKey' | 'listFiles' | 'deleteFile'>,
    pageId: number,
    keepUrls: readonly (string | null | undefined)[],
    options: IPrunePageThumbnailsOptions = {}
): Promise<void> {
    const keep = new Set(
        keepUrls.filter((url): url is string => Boolean(url)).map((url) => stripUrlQuery(url))
    );
    const graceMs = options.includeRecentUploads ? 0 : RECENT_UPLOAD_GRACE_MS;

    for (const filenamePrefix of buildThumbnailFilenamePrefixes(pageId)) {
        let prefixKey: string;

        try {
            prefixKey = publish.buildFileKey('thumbnail', filenamePrefix);
        } catch {
            // A refusal while building the key means the publication storage is
            // not configured: such an installation has no preview files at all,
            // and there is nothing to sweep. Silently — otherwise an ordinary page
            // deletion would print a stack trace on every installation with no S3
            return;
        }

        try {
            const files = await publish.listFiles(prefixKey);

            for (const file of files) {
                if (keep.has(stripUrlQuery(file.url))) {
                    continue;
                }

                if (graceMs > 0 && isRecentUpload(file.lastModified, graceMs)) {
                    continue;
                }

                try {
                    await publish.deleteFile(file.url);
                } catch (error: unknown) {
                    console.warn('[Page Thumbnails] Failed to delete orphaned thumbnail:', error);
                }
            }
        } catch (error: unknown) {
            console.warn('[Page Thumbnails] Failed to list page thumbnails:', error);
        }
    }
}

/**
 * Sweeps the orphans after a new page frame has been uploaded: assembles the keep
 * list out of the live sources and hands it to `prunePageThumbnails`.
 *
 * There are three sources — the page itself, all of its versions and the frame just
 * uploaded (it is not in the database yet: the client writes the URL with a
 * separate PATCH). They cannot be collected in a single read, and a restore's
 * commit can land between the reads: in one transaction it carries the page's frame
 * off into a new version, gives the page the chosen version's frame and trims the
 * history down to the limit — over a filled history a restore to the oldest version
 * deletes that very version's row.
 *
 * Hence the order "page → versions → page": the page is read twice, and any
 * interleaving leaves both contested frames in the list. The frame the restore
 * pushed out is either still on the page (a read before the restore) or already in
 * a version (the list after it). The restored version's frame is either still in
 * the version list (a read before the restore) or already on the page (the second
 * read after it). The first read arrives as a parameter: it is done by the caller,
 * who needs the page for the existence check anyway.
 *
 * Best-effort throughout: a preview is a secondary artifact, and a failed database
 * read must not turn a successful snapshot upload into an error.
 *
 * @param deps - The storage and publish adapters (narrow contracts).
 * @param pageId - The page identifier.
 * @param uploadedUrl - The URL of the frame just uploaded.
 * @param pageThumbnailUrl - The page's frame as of the read before this call.
 */
export async function prunePageThumbnailsAfterUpload(
    deps: IPageThumbnailPruneDeps,
    pageId: number,
    uploadedUrl: string,
    pageThumbnailUrl: string | null
): Promise<void> {
    try {
        const versions = await deps.storage.listPageVersions(pageId);
        const pageAfterVersions = await deps.storage.getPage(pageId);

        await prunePageThumbnails(deps.publish, pageId, [
            uploadedUrl,
            pageThumbnailUrl,
            pageAfterVersions?.thumbnailUrl,
            ...versions.map((version) => version.thumbnailUrl),
        ]);
    } catch (error: unknown) {
        console.warn('[Page Thumbnails] Failed to prune orphaned thumbnails:', error);
    }
}
