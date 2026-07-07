// #region Imports
import { randomUUID } from 'crypto';
import { createError, defineEventHandler, readMultipartFormData, type MultiPartData } from 'h3';
import { normalizeBricksError } from '../../../modules/common/utils/main';
import { useBricksPublishAdapter } from '../../../modules/persistence/server/registry';
import {
    getFileExtension,
    isVideoFile,
    resolveMediaConfig,
} from '../../../modules/persistence/server/utils/imageProcessing';
import {
    validateAndOptimizeImage,
    validateVideo,
} from '../../../modules/persistence/server/utils/mediaProcessing';
// #endregion

// #region Interfaces
interface IS3UploadResponse {
    success: boolean;
    url: string;
    filename: string;
    size: number;
    mimeType: string;
}
// #endregion

// #region Helpers
/**
 * Достаёт файл из multipart-формы и валидирует наличие данных.
 *
 * @param formData - Коллекция multipart-полей.
 * @returns Найденный файл.
 */
function assertUploadedFile(
    formData: Awaited<ReturnType<typeof readMultipartFormData>>
): MultiPartData {
    const file = formData?.find((item) => item.name === 'file');

    if (!file || !file.data) {
        throw createError({
            statusCode: 400,
            message: 'Invalid file data',
        });
    }

    return file;
}
// #endregion

/**
 * POST /mock-api/s3-image — загружает файл в хранилище публикации и возвращает URL.
 * Не сохраняет метаданные в БД — только загрузка через publish-адаптер.
 */
export default defineEventHandler(async (event): Promise<IS3UploadResponse> => {
    try {
        const formData = await readMultipartFormData(event);

        if (!formData || formData.length === 0) {
            throw createError({
                statusCode: 400,
                message: 'No file uploaded',
            });
        }

        const file = assertUploadedFile(formData);
        const config = resolveMediaConfig();
        const fileExtension = getFileExtension(file.filename);
        const isVideo = isVideoFile(file.type, fileExtension);

        let uploadBuffer: Buffer;
        let mimeType: string;
        let targetExtension: string;

        if (isVideo) {
            const validated = validateVideo(
                file,
                config.maxVideoUploadSizeBytes,
                config.maxVideoUploadSizeMb
            );
            uploadBuffer = validated.buffer;
            mimeType = validated.mimeType;
            targetExtension = validated.targetExtension;
        } else {
            const validated = await validateAndOptimizeImage(
                file,
                config.maxUploadSizeBytes,
                config.maxUploadSizeMb,
                config.optimization
            );
            uploadBuffer = validated.optimizedBuffer;
            mimeType = validated.mimeType;
            targetExtension = validated.targetExtension;
        }

        const uniqueFilename = `${randomUUID()}.${targetExtension}`;
        const key = `bricks-media/${uniqueFilename}`;

        const uploaded = await useBricksPublishAdapter().uploadFile({
            buffer: uploadBuffer,
            mimeType,
            key,
        });

        return {
            success: true,
            url: uploaded.url,
            filename: file.filename || uniqueFilename,
            size: uploaded.size,
            mimeType,
        };
    } catch (error: unknown) {
        console.error('[S3 Upload] Error:', error);

        const { statusCode, statusMessage } = normalizeBricksError(
            error,
            'Failed to upload file to S3'
        );
        throw createError({ statusCode, message: statusMessage });
    }
});
