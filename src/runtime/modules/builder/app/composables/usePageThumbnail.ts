// #region Imports
// Types
import type { IThumbnailUploadResponse, IUsePageThumbnailReturn } from '../types/composables';
import type { IBuilderSessionToken } from '../types/session';

// Constants
import { BRICKS_THUMBNAIL_UPLOAD_TIMEOUT_MS } from '../../../common/constants/apiTimeouts';

// Composables
import { useApiClient } from '../../../common/composables/useApiClient';
import { useCanvasSnapshot } from './useCanvasSnapshot';

// Pinia
import { usePublishStore } from '../../publish/stores/publish';
// #endregion

/**
 * The canvas snapshot for the page preview in the /bricks dashboard: it shoots the
 * canvas (`useCanvasSnapshot`), uploads the frame into S3 and patches the
 * `thumbnailUrl` of the page. Fire-and-forget: any error is put out with a
 * `console.warn`, the save of the page is not blocked.
 *
 * @param sessionToken - The session token: a snapshot of the canvas belongs to the
 * page the request went out of.
 */
export function usePageThumbnail(sessionToken: IBuilderSessionToken): IUsePageThumbnailReturn {
    const publishStore = usePublishStore();
    const { captureCanvasSnapshot } = useCanvasSnapshot(sessionToken);

    /**
     * Shoots the canvas, uploads the snapshot into S3 and saves the `thumbnailUrl` of
     * the page with a PATCH. The session boundaries of the shot are in
     * `captureCanvasSnapshot`: a frame shot after a move never reaches the upload.
     *
     * @param pageId - The identifier of the saved page.
     * @param startedIn - The session token taken at the start of the save.
     */
    async function captureAndUploadThumbnail(
        pageId: string | number,
        startedIn: number
    ): Promise<void> {
        try {
            const blob = await captureCanvasSnapshot(startedIn);

            if (!blob) {
                return;
            }

            const formData = new FormData();
            formData.append('file', blob, `page-${pageId}.jpg`);
            formData.append('pageId', String(pageId));

            const { apiFetcher } = useApiClient();
            const response = await apiFetcher<IThumbnailUploadResponse>(
                '/api/bricks/media/s3-page-thumbnail',
                {
                    method: 'POST',
                    body: formData,
                    timeout: BRICKS_THUMBNAIL_UPLOAD_TIMEOUT_MS,
                }
            );

            if (!response.success || !response.url) {
                throw new Error('Thumbnail upload failed');
            }

            // No cache buster: the key is unique per upload, so the URL of a new
            // frame is a new one by itself. The former `?v=<ts>` would only get in
            // the way now — the version snapshot carries this very URL into the
            // history, and the versions would differ from one another by a query
            // parameter rather than by the file
            await publishStore.patchPage(pageId, { thumbnailUrl: response.url });
        } catch (error: unknown) {
            console.warn('[Bricks Thumbnail] Capture failed:', error);
        }
    }

    return { captureAndUploadThumbnail };
}
