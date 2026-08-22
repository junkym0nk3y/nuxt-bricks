// #region Imports
import { createError, defineEventHandler } from 'h3';
import type { IApiError } from '../../../../modules/common/types/bricks-api';
import { normalizeBricksError } from '../../../../modules/common/utils/main';
import {
    useBricksPublishAdapter,
    useBricksStorageAdapter,
} from '../../../../modules/persistence/server/registry';
import {
    collectWebStreamWithLimit,
    readJsonBodyWithLimit,
} from '../../../../modules/persistence/server/utils/requestBodyLimits';
import { rethrowStatementTimeoutError } from '../../../../modules/persistence/server/utils/handlerHelpers';
// #endregion

// #region Interfaces
interface IMediaProxyRequest {
    url: string;
}

interface IMediaProxyResponse {
    dataUrl: string;
}
// #endregion

// #region Constants
/** Maximum size of a proxied file (MB) */
const MAX_PROXY_FILE_MB = 25;
const MAX_PROXY_FILE_BYTES = MAX_PROXY_FILE_MB * 1024 * 1024;
/** Timeout of the request to the storage (ms) */
const PROXY_FETCH_TIMEOUT_MS = 10_000;
/** Limit of the JSON request body (it carries only a URL) */
const MAX_REQUEST_BODY_BYTES = 16 * 1024;
// #endregion

/**
 * POST /api/bricks/media/s3-proxy — serves a media file of the bucket as a data
 * URL. Needed for the client-side canvas snapshot (usePageThumbnail): an S3
 * bucket without CORS headers does not let dom-to-image inline the images, while
 * a same-origin handler does.
 *
 * Anti-SSRF (two independent barriers): the URL must be registered in the media
 * library (bricks_media) AND belong to our own storage (isOwnedUrl) — the
 * database record is not trusted as the authority (legacy bricks_media rows could
 * have reached the table before the current upload flow started validating the
 * URL on write). The fetch runs with no redirects, with a timeout and with a size
 * limit both before and while the body is read.
 */
export default defineEventHandler(async (event): Promise<IMediaProxyResponse> => {
    try {
        const body = await readJsonBodyWithLimit<IMediaProxyRequest>(event, MAX_REQUEST_BODY_BYTES);

        if (!body?.url || typeof body.url !== 'string') {
            throw createError({
                statusCode: 400,
                message: 'URL is required',
            });
        }

        const media = await useBricksStorageAdapter().getMediaByUrl(body.url);

        if (!media || !useBricksPublishAdapter().isOwnedUrl(media.url)) {
            throw createError({
                statusCode: 403,
                message: 'URL is not a registered media file',
            });
        }

        const response = await fetch(media.url, {
            redirect: 'error',
            signal: AbortSignal.timeout(PROXY_FETCH_TIMEOUT_MS),
        });

        if (!response.ok) {
            throw createError({
                statusCode: 502,
                message: `Failed to fetch media file (${response.status})`,
            });
        }

        const contentLength = Number(response.headers.get('content-length'));

        if (Number.isFinite(contentLength) && contentLength > MAX_PROXY_FILE_BYTES) {
            throw createError({
                statusCode: 413,
                message: `Media file exceeds ${MAX_PROXY_FILE_MB}MB limit`,
            });
        }

        const buffer = response.body
            ? await collectWebStreamWithLimit(response.body, MAX_PROXY_FILE_BYTES, () =>
                  createError({
                      statusCode: 413,
                      message: `Media file exceeds ${MAX_PROXY_FILE_MB}MB limit`,
                  })
              )
            : Buffer.alloc(0);
        const mimeType = response.headers.get('content-type') || media.mimeType;

        return {
            dataUrl: `data:${mimeType};base64,${buffer.toString('base64')}`,
        };
    } catch (error: unknown) {
        // A createError from higher up the stack (validation, 403) is rethrown as it is
        if ((error as IApiError)?.statusCode) {
            throw error;
        }

        // The media lookup by URL hits the database before S3 is touched, and its
        // statement timeout would turn into a generic 500 with no machine-readable
        // code here
        rethrowStatementTimeoutError(error);

        console.error('[S3 Media Proxy] Error:', error);

        const { statusCode, statusMessage } = normalizeBricksError(
            error,
            'Failed to proxy media file'
        );
        throw createError({ statusCode, message: statusMessage });
    }
});
