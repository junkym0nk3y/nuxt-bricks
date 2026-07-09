// #region Imports
import { createError, defineEventHandler, readBody } from 'h3';
import type { IApiError } from '../../../modules/common/types/bricks-api';
import { normalizeBricksError } from '../../../modules/common/utils/main';
import { useBricksStorageAdapter } from '../../../modules/persistence/server/registry';
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
// #endregion

/**
 * POST /mock-api/s3-media-proxy — отдаёт медиа-файл бакета как data URL.
 * Нужен для клиентского снапшота канваса (usePageThumbnail): S3-бакет без CORS-заголовков
 * не даёт dom-to-image встроить изображения, а same-origin ручка — даёт.
 * Anti-SSRF: проксируются только URL, зарегистрированные в медиа-библиотеке (bricks_media).
 */
export default defineEventHandler(async (event): Promise<IMediaProxyResponse> => {
    try {
        const body = await readBody<IMediaProxyRequest>(event);

        if (!body?.url || typeof body.url !== 'string') {
            throw createError({
                statusCode: 400,
                message: 'URL is required',
            });
        }

        const media = await useBricksStorageAdapter().getMediaByUrl(body.url);

        if (!media) {
            throw createError({
                statusCode: 403,
                message: 'URL is not a registered media file',
            });
        }

        const response = await fetch(media.url);

        if (!response.ok) {
            throw createError({
                statusCode: 502,
                message: `Failed to fetch media file (${response.status})`,
            });
        }

        const buffer = Buffer.from(await response.arrayBuffer());

        if (buffer.length > MAX_PROXY_FILE_MB * 1024 * 1024) {
            throw createError({
                statusCode: 413,
                message: `Media file exceeds ${MAX_PROXY_FILE_MB}MB limit`,
            });
        }

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
