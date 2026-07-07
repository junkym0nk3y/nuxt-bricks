// #region Imports
import type { IApiError } from '../../../modules/common/types/bricks-api';
import { createError, defineEventHandler, readBody } from 'h3';
import { normalizeBricksError } from '../../../modules/common/utils/main';
import { useBricksPublishAdapter } from '../../../modules/persistence/server/registry';
// #endregion

// #region Interfaces
interface IS3DeleteRequest {
    url: string;
}

interface IS3DeleteResponse {
    success: boolean;
}
// #endregion

/**
 * POST /mock-api/s3-delete — удаляет файл из хранилища публикации по URL.
 */
export default defineEventHandler(async (event): Promise<IS3DeleteResponse> => {
    try {
        const body = await readBody<IS3DeleteRequest>(event);

        if (!body?.url) {
            throw createError({
                statusCode: 400,
                message: 'URL is required',
            });
        }

        await useBricksPublishAdapter().deleteFile(body.url);

        return {
            success: true,
        };
    } catch (error: unknown) {
        // createError выше по стеку (например, валидация body) пробрасываем как есть
        if ((error as IApiError)?.statusCode) {
            throw error;
        }

        console.error('[S3 Delete] Error:', error);

        const { statusCode, statusMessage } = normalizeBricksError(
            error,
            'Failed to delete file from S3'
        );
        throw createError({ statusCode, message: statusMessage });
    }
});
