/**
 * Дефолтный IPublishAdapter поверх S3-совместимого хранилища (Yandex Object Storage).
 * Конфигурация — runtimeConfig.bricksS3 (см. module.ts) с fallback на legacy ENV
 * YANDEX_STORAGE_* для обратной совместимости.
 */
import {
    S3Client,
    PutObjectCommand,
    DeleteObjectCommand,
    ListObjectsV2Command,
} from '@aws-sdk/client-s3';
import { useRuntimeConfig } from 'nitropack/runtime';
import type {
    IPublishAdapter,
    IUploadFileParams,
    IUploadedFile,
    IStoredFileInfo,
} from '../../types/adapters';

/**
 * Разрешённая конфигурация S3-хранилища.
 */
interface IResolvedS3Config {
    endpoint: string;
    region: string;
    bucket: string;
    accessKeyId: string;
    secretAccessKey: string;
    prefix: string;
}

/**
 * Сырая конфигурация из runtimeConfig.bricksS3 (все поля опциональны).
 */
type TRawS3Config = Partial<IResolvedS3Config> | undefined;

/**
 * Резолвит конфигурацию S3 из runtimeConfig с fallback на legacy ENV.
 *
 * @returns Полная конфигурация хранилища.
 */
function resolveS3Config(): IResolvedS3Config {
    const config = useRuntimeConfig();
    const raw = config.bricksS3 as TRawS3Config;

    const bucket = raw?.bucket || process.env.YANDEX_STORAGE_BUCKET_NAME || '';

    if (!bucket) {
        throw new Error(
            '[S3] Bucket is not configured. ' +
                'Set bricks.s3.bucket in nuxt.config (or NUXT_BRICKS_S3_BUCKET / YANDEX_STORAGE_BUCKET_NAME env).'
        );
    }

    return {
        endpoint: raw?.endpoint || 'https://storage.yandexcloud.net',
        region: raw?.region || 'ru-central1',
        bucket,
        accessKeyId: raw?.accessKeyId || process.env.YANDEX_STORAGE_ACCESS_KEY_ID || '',
        secretAccessKey: raw?.secretAccessKey || process.env.YANDEX_STORAGE_SECRET_ACCESS_KEY || '',
        prefix: raw?.prefix || 'bricks-media/',
    };
}

/**
 * Извлекает S3 key из публичного URL файла.
 *
 * @param url - Полный URL файла.
 * @param config - Конфигурация хранилища.
 * @returns Key или null, если URL не принадлежит бакету.
 */
function extractKeyFromUrl(url: string, config: IResolvedS3Config): string | null {
    const prefix = `${config.endpoint}/${config.bucket}/`;

    if (url.startsWith(prefix)) {
        return url.slice(prefix.length);
    }

    return null;
}

/**
 * Создаёт S3-реализацию IPublishAdapter с ленивым клиентом.
 *
 * @returns Адаптер файлового хранилища публикации.
 */
export function createS3PublishAdapter(): IPublishAdapter {
    let client: S3Client | null = null;
    let resolvedConfig: IResolvedS3Config | null = null;

    /**
     * Лениво создаёт S3-клиент и резолвит конфигурацию.
     */
    function useClient(): { client: S3Client; config: IResolvedS3Config } {
        if (!client || !resolvedConfig) {
            resolvedConfig = resolveS3Config();
            client = new S3Client({
                region: resolvedConfig.region,
                endpoint: resolvedConfig.endpoint,
                credentials: {
                    accessKeyId: resolvedConfig.accessKeyId,
                    secretAccessKey: resolvedConfig.secretAccessKey,
                },
            });
        }

        return { client, config: resolvedConfig };
    }

    return {
        /**
         * Загружает файл в бакет и возвращает публичный URL.
         */
        async uploadFile(params: IUploadFileParams): Promise<IUploadedFile> {
            const { client: s3, config } = useClient();

            await s3.send(
                new PutObjectCommand({
                    Bucket: config.bucket,
                    Key: params.key,
                    Body: params.buffer,
                    ContentType: params.mimeType,
                    ACL: 'public-read',
                })
            );

            return {
                url: `${config.endpoint}/${config.bucket}/${params.key}`,
                key: params.key,
                size: params.buffer.length,
            };
        },

        /**
         * Удаляет файл из бакета по публичному URL.
         */
        async deleteFile(url: string): Promise<void> {
            const { client: s3, config } = useClient();
            const key = extractKeyFromUrl(url, config);

            if (!key) {
                throw new Error(
                    'Invalid storage URL: file does not belong to the configured bucket'
                );
            }

            await s3.send(
                new DeleteObjectCommand({
                    Bucket: config.bucket,
                    Key: key,
                })
            );
        },

        /**
         * Возвращает список файлов бакета по префиксу (дефолт — bricks-media/).
         */
        async listFiles(prefix?: string): Promise<IStoredFileInfo[]> {
            const { client: s3, config } = useClient();

            const response = await s3.send(
                new ListObjectsV2Command({
                    Bucket: config.bucket,
                    Prefix: prefix ?? config.prefix,
                })
            );

            const contents = response.Contents ?? [];

            return contents
                .filter((item) => Boolean(item.Key) && !item.Key?.endsWith('/'))
                .map((item) => ({
                    key: item.Key || '',
                    url: `${config.endpoint}/${config.bucket}/${item.Key}`,
                    size: item.Size || 0,
                    lastModified: item.LastModified?.toISOString() || new Date().toISOString(),
                }));
        },
    };
}
