// #region Imports
import { DeleteObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { createError, defineEventHandler, readBody } from 'h3';
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
interface IS3DeleteRequest {
    url: string;
}

interface IS3DeleteResponse {
    success: boolean;
}
// #endregion

// #region Helpers
/**
 * Извлекает S3 key из полного URL.
 *
 * @param url - Полный URL файла в S3.
 * @param bucketName - Имя бакета.
 * @returns S3 key или null.
 */
function extractS3KeyFromUrl(url: string, bucketName: string): string | null {
    const prefix = `https://storage.yandexcloud.net/${bucketName}/`;

    if (url.startsWith(prefix)) {
        return url.slice(prefix.length);
    }

    return null;
}
// #endregion

/**
 * POST /mock-api/s3-delete — удаляет файл из S3 по URL.
 */
export default defineEventHandler(async (event): Promise<IS3DeleteResponse> => {
    const bucketName = process.env.YANDEX_STORAGE_BUCKET_NAME;

    if (!bucketName) {
        throw createError({
            statusCode: 500,
            message: 'Bucket name not configured',
        });
    }

    try {
        const body = await readBody<IS3DeleteRequest>(event);

        if (!body?.url) {
            throw createError({
                statusCode: 400,
                message: 'URL is required',
            });
        }

        const s3Key = extractS3KeyFromUrl(body.url, bucketName);

        if (!s3Key) {
            throw createError({
                statusCode: 400,
                message: 'Invalid S3 URL',
            });
        }

        await s3Client.send(
            new DeleteObjectCommand({
                Bucket: bucketName,
                Key: s3Key,
            })
        );

        return {
            success: true,
        };
    } catch (error: unknown) {
        const err = error as { statusCode?: number; message?: string };

        if (err.statusCode) {
            throw error;
        }

        console.error('[S3 Delete] Error:', error);

        throw createError({
            statusCode: 500,
            message: err.message || 'Failed to delete file from S3',
        });
    }
});
