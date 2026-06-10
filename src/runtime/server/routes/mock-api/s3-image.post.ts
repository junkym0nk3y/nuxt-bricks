// #region Imports
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { randomUUID } from 'crypto';
import { createError, defineEventHandler, readMultipartFormData, type MultiPartData } from 'h3';
import { getFileExtension, isVideoFile, resolveMediaConfig } from '../../utils/db/images';
import { validateAndOptimizeImage, validateVideo } from '../../utils/db/media';
// #endregion

// #region Data
const s3Client = new S3Client({
    region: 'ru-central1',
    endpoint: 'https://storage.yandexcloud.net',
    credentials: {
        accessKeyId: process.env.YANDEX_STORAGE_ACCESS_KEY_ID || '',
        secretAccessKey: process.env.YANDEX_STORAGE_SECRET_ACCESS_KEY || '',
    },
});
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

/**
 * Проверяет наличие bucket name в окружении.
 *
 * @returns Название bucket.
 */
function requireBucketName(): string {
    const bucketName = process.env.YANDEX_STORAGE_BUCKET_NAME;

    if (!bucketName) {
        throw createError({
            statusCode: 500,
            message: 'Bucket name not configured',
        });
    }

    return bucketName;
}
// #endregion

/**
 * POST /mock-api/s3-image — загружает файл в S3 и возвращает URL.
 * Не сохраняет метаданные в БД — только загрузка в хранилище.
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
        const bucketName = requireBucketName();
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
        const key = `landing-media/${uniqueFilename}`;

        // Загружаем в S3
        await s3Client.send(
            new PutObjectCommand({
                Bucket: bucketName,
                Key: key,
                Body: uploadBuffer,
                ContentType: mimeType,
                ACL: 'public-read',
            })
        );

        const url = `https://storage.yandexcloud.net/${bucketName}/${key}`;

        return {
            success: true,
            url,
            filename: file.filename || uniqueFilename,
            size: uploadBuffer.length,
            mimeType,
        };
    } catch (error: unknown) {
        const err = error as { statusCode?: number; message?: string };
        console.error('[S3 Upload] Error:', error);

        throw createError({
            statusCode: err.statusCode || 500,
            message: err.message || 'Failed to upload file to S3',
        });
    }
});
