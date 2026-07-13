/**
 * Дефолтный IPublishAdapter поверх S3-совместимого хранилища (Yandex Object Storage).
 * Конфигурация — runtimeConfig.bricksS3 (см. module.ts; runtime-override —
 * NUXT_BRICKS_S3_*).
 */
import {
    S3Client,
    PutObjectCommand,
    DeleteObjectCommand,
    ListObjectsV2Command,
} from '@aws-sdk/client-s3';
import { useRuntimeConfig } from 'nitropack/runtime';
import { extractStorageKey, isManagedStorageKey } from './s3KeyPolicy';
import type {
    IPublishAdapter,
    IUploadFileParams,
    IUploadedFile,
    IStoredFileInfo,
    TPublishFileKind,
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
    thumbnailsPrefix: string;
}

/**
 * Сырая конфигурация из runtimeConfig.bricksS3 (все поля опциональны).
 */
type TRawS3Config = Partial<IResolvedS3Config> | undefined;

/**
 * Резолвит конфигурацию S3 из runtimeConfig.
 *
 * @returns Полная конфигурация хранилища.
 */
function resolveS3Config(): IResolvedS3Config {
    const config = useRuntimeConfig();
    const raw = config.bricksS3 as TRawS3Config;

    const bucket = raw?.bucket || '';

    if (!bucket) {
        throw new Error(
            '[S3] Bucket is not configured. ' +
                'Set bricks.s3.bucket in nuxt.config (or NUXT_BRICKS_S3_BUCKET env).'
        );
    }

    return {
        endpoint: raw?.endpoint || 'https://storage.yandexcloud.net',
        region: raw?.region || 'ru-central1',
        bucket,
        accessKeyId: raw?.accessKeyId || '',
        secretAccessKey: raw?.secretAccessKey || '',
        prefix: raw?.prefix || 'bricks-media/',
        thumbnailsPrefix: raw?.thumbnailsPrefix || 'bricks-thumbnails/',
    };
}

/**
 * Managed-префиксы ключей модуля в бакете: только внутри них адаптер
 * создаёт и удаляет объекты (см. контракт IPublishAdapter).
 *
 * @param config - Конфигурация хранилища.
 * @returns Список префиксов.
 */
function resolveManagedPrefixes(config: IResolvedS3Config): string[] {
    return [config.prefix, config.thumbnailsPrefix];
}

/**
 * Извлекает S3 key из публичного URL, только если ключ лежит внутри
 * managed namespace модуля.
 *
 * @param url - Полный URL файла.
 * @param config - Конфигурация хранилища.
 * @returns Key или null (чужой бакет / посторонний префикс).
 */
function extractManagedKey(url: string, config: IResolvedS3Config): string | null {
    const key = extractStorageKey(url, config);

    if (!key || !isManagedStorageKey(key, resolveManagedPrefixes(config))) {
        return null;
    }

    return key;
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
         * Строит полный object key нового файла: managed-префикс по типу файла
         * (`prefix` для медиа, `thumbnailsPrefix` для превью страниц) + имя.
         */
        buildFileKey(kind: TPublishFileKind, filename: string): string {
            const { config } = useClient();
            const prefixByKind: Record<TPublishFileKind, string> = {
                media: config.prefix,
                thumbnail: config.thumbnailsPrefix,
            };

            return `${prefixByKind[kind]}${filename}`;
        },

        /**
         * Загружает файл в бакет и возвращает публичный URL.
         * Ключи вне managed namespace отклоняются — ключ обязан быть построен
         * через buildFileKey.
         */
        async uploadFile(params: IUploadFileParams): Promise<IUploadedFile> {
            const { client: s3, config } = useClient();

            if (!isManagedStorageKey(params.key, resolveManagedPrefixes(config))) {
                throw new Error(
                    'Invalid storage key: object key is outside of the managed prefixes'
                );
            }

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
         * Удаляет файл из бакета по публичному URL. URL вне собственного бакета
         * или managed-префиксов — ошибка (в shared-бакете посторонние объекты
         * не трогаем).
         */
        async deleteFile(url: string): Promise<void> {
            const { client: s3, config } = useClient();
            const key = extractManagedKey(url, config);

            if (!key) {
                throw new Error(
                    'Invalid storage URL: file does not belong to the managed storage prefixes'
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
         * Проверяет принадлежность URL собственному хранилищу (anti-SSRF контракт):
         * хост фиксирован конфигом (`endpoint/bucket/`), ключ обязан лежать
         * внутри managed-префиксов — произвольные origin и посторонние объекты
         * shared-бакета не проходят.
         */
        isOwnedUrl(url: string): boolean {
            const { config } = useClient();
            return extractManagedKey(url, config) !== null;
        },

        /**
         * Возвращает полный список файлов бакета по префиксу (дефолт —
         * bricks-media/). ListObjectsV2 отдаёт максимум 1000 объектов за
         * запрос — страницы дочитываются по NextContinuationToken.
         */
        async listFiles(prefix?: string): Promise<IStoredFileInfo[]> {
            const { client: s3, config } = useClient();
            const files: IStoredFileInfo[] = [];
            let continuationToken: string | undefined;

            do {
                const response = await s3.send(
                    new ListObjectsV2Command({
                        Bucket: config.bucket,
                        Prefix: prefix ?? config.prefix,
                        ContinuationToken: continuationToken,
                    })
                );

                const contents = response.Contents ?? [];

                files.push(
                    ...contents
                        .filter((item) => Boolean(item.Key) && !item.Key?.endsWith('/'))
                        .map((item) => ({
                            key: item.Key || '',
                            url: `${config.endpoint}/${config.bucket}/${item.Key}`,
                            size: item.Size || 0,
                            lastModified:
                                item.LastModified?.toISOString() || new Date().toISOString(),
                        }))
                );

                continuationToken = response.IsTruncated
                    ? response.NextContinuationToken
                    : undefined;
            } while (continuationToken);

            return files;
        },
    };
}
