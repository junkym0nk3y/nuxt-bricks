// #region Imports
import { createError, defineEventHandler } from 'h3';
import type { IApiError } from '../../../modules/common/types/bricks-api';
import { normalizeBricksError } from '../../../modules/common/utils/main';
import {
    useBricksPublishAdapter,
    useBricksStorageAdapter,
} from '../../../modules/persistence/server/registry';
import {
    collectWebStreamWithLimit,
    readJsonBodyWithLimit,
} from '../../../modules/persistence/server/utils/requestBodyLimits';
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
/** Максимальный размер проксируемого файла (МБ). */
const MAX_PROXY_FILE_MB = 25;
const MAX_PROXY_FILE_BYTES = MAX_PROXY_FILE_MB * 1024 * 1024;
/** Таймаут запроса к хранилищу (мс). */
const PROXY_FETCH_TIMEOUT_MS = 10_000;
/** Лимит JSON-тела запроса (в нём только URL). */
const MAX_REQUEST_BODY_BYTES = 16 * 1024;
// #endregion

/**
 * POST /mock-api/s3-media-proxy — отдаёт медиа-файл бакета как data URL.
 * Нужен для клиентского снапшота канваса (usePageThumbnail): S3-бакет без CORS-заголовков
 * не даёт dom-to-image встроить изображения, а same-origin ручка — даёт.
 *
 * Anti-SSRF (два независимых барьера): URL обязан быть зарегистрирован
 * в медиа-библиотеке (bricks_media) И принадлежать собственному хранилищу
 * (isOwnedUrl) — записи БД не доверяем как authority (легаси-записи могли
 * сохраниться до валидации URL на POST /api/bricks/media). Fetch — без
 * редиректов, с таймаутом и лимитом размера до/во время чтения тела.
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
        // createError выше по стеку (валидация, 403) пробрасываем как есть
        if ((error as IApiError)?.statusCode) {
            throw error;
        }

        console.error('[S3 Media Proxy] Error:', error);

        const { statusCode, statusMessage } = normalizeBricksError(
            error,
            'Failed to proxy media file'
        );
        throw createError({ statusCode, message: statusMessage });
    }
});
