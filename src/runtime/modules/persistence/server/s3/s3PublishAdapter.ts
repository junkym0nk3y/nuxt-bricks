/**
 * The default IPublishAdapter over S3-compatible storage (Yandex Object Storage).
 * The configuration is runtimeConfig.bricksS3 (see module.ts; the runtime
 * override is NUXT_BRICKS_S3_*).
 */
import {
    S3Client,
    PutObjectCommand,
    DeleteObjectCommand,
    ListObjectsV2Command,
} from '@aws-sdk/client-s3';
import { useRuntimeConfig } from 'nitropack/runtime';
import { extractStorageKey, findManagedPrefixConflict, isManagedStorageKey } from './s3KeyPolicy';
import type {
    IPublishAdapter,
    IUploadFileParams,
    IUploadedFile,
    IStoredFileInfo,
    TPublishFileKind,
} from '../../types/adapters';

/**
 * The ceiling for establishing the TCP connection to storage (ms): an unreachable
 * endpoint must fail fast — the whole media upload waits on it.
 */
const S3_CONNECTION_TIMEOUT_MS = 5_000;
/**
 * The ceiling of socket SILENCE (ms), not of the whole operation: files of up to a
 * hundred megabytes go through PUT, and an overall ceiling would cut off a healthy
 * upload over a slow link. Without it a hung endpoint would hold the request
 * forever — a client abort never reaches the AWS SDK, meaning the upload handler
 * had not a single bound of its own on waiting for storage.
 *
 * It goes into `socketTimeout` specifically. The similar-looking `requestTimeout`
 * is a trap here: it bounds the total time of the request and the response, and
 * without `throwOnRequestTimeout` it merely writes a warning to the log when
 * exceeded, aborting nothing (see `@smithy/node-http-handler`). That is, it does
 * not cure a hung endpoint, and turned on as an error it would cut a
 * hundred-megabyte upload off by total time.
 */
const S3_SOCKET_TIMEOUT_MS = 30_000;
/**
 * The total attempts per request (one plus a retry). The default three over a hung
 * endpoint give three silence windows in a row plus the backoff — up to a minute
 * and a half of waiting on an interactive upload; a single retry is enough to
 * survive a one-off network failure, and the request body is replayable (a Buffer)
 * with the key always new.
 */
const S3_MAX_ATTEMPTS = 2;
/**
 * The ceiling of the compensating deletion (ms). A bound of its own is needed
 * because the cleanup runs through the same client with the same retries: without
 * it the original upload error would only come back outward after the cleanup's
 * own silence windows.
 */
const S3_CLEANUP_TIMEOUT_MS = 10_000;

/**
 * The resolved configuration of the S3 storage.
 */
interface IResolvedS3Config {
    endpoint: string;
    region: string;
    bucket: string;
    accessKeyId: string;
    secretAccessKey: string;
    prefix: string;
    thumbnailsPrefix: string;
    avatarsPrefix: string;
}

/**
 * The raw configuration from runtimeConfig.bricksS3 (every field optional).
 */
type TRawS3Config = Partial<IResolvedS3Config> | undefined;

/**
 * Resolves the S3 configuration from runtimeConfig.
 *
 * @returns The full storage configuration.
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

    const prefix = raw?.prefix || 'bricks-media/';
    const thumbnailsPrefix = raw?.thumbnailsPrefix || 'bricks-thumbnails/';
    const avatarsPrefix = raw?.avatarsPrefix || 'bricks-avatars/';

    // The isolation of the namespaces rests solely on the prefixes not
    // overlapping, and the values are overridden by NUXT_BRICKS_S3_* at runtime —
    // a build-time check would not see them. The refusal is loud: a silently
    // working configuration in which avatars land in the media library's listing
    // breaks the module's promise
    const conflict = findManagedPrefixConflict({ prefix, thumbnailsPrefix, avatarsPrefix });

    if (conflict) {
        throw new Error(
            `[S3] Invalid managed prefixes: ${conflict}. ` +
                'Set distinct, non-nested bricks.s3 prefixes (or NUXT_BRICKS_S3_* env).'
        );
    }

    return {
        endpoint: raw?.endpoint || 'https://storage.yandexcloud.net',
        region: raw?.region || 'ru-central1',
        bucket,
        accessKeyId: raw?.accessKeyId || '',
        secretAccessKey: raw?.secretAccessKey || '',
        prefix,
        thumbnailsPrefix,
        avatarsPrefix,
    };
}

/**
 * The managed prefixes of the module's keys in the bucket: only inside them does
 * the adapter create and delete objects (see the IPublishAdapter contract).
 *
 * Avatars are part of the set because otherwise the adapter could neither write
 * nor delete their file (`uploadFile` and `deleteFile` refuse keys outside the
 * namespace). The media library does not fill up from that: the bucket import
 * reads `prefix` only, and media records are created by an upload with a key of
 * its own.
 *
 * @param config - The storage configuration.
 * @returns The list of prefixes.
 */
function resolveManagedPrefixes(config: IResolvedS3Config): string[] {
    return [config.prefix, config.thumbnailsPrefix, config.avatarsPrefix];
}

/**
 * Extracts the S3 key from a public URL, only when the key lies inside the
 * module's managed namespace.
 *
 * @param url - The file's full URL.
 * @param config - The storage configuration.
 * @returns The key, or null (a foreign bucket / an outside prefix).
 */
function extractManagedKey(url: string, config: IResolvedS3Config): string | null {
    const key = extractStorageKey(url, config);

    if (!key || !isManagedStorageKey(key, resolveManagedPrefixes(config))) {
        return null;
    }

    return key;
}

/**
 * Best-effort cleanup of an object whose write ended in an unknown outcome.
 *
 * A failed PUT does not prove the object is absent from the bucket: the response
 * could have been lost or hit a timeout after the write already happened. The
 * caller received no URL in the process, meaning it has nothing to delete the
 * object by and no link to it will ever appear — the cleanup is only possible
 * here. A waiting bound of its own is mandatory: without it the original upload
 * error would additionally wait through the cleanup's retries.
 *
 * @param client - The S3 client.
 * @param bucket - The storage bucket.
 * @param key - The key of the object that may have been written.
 */
async function discardUnconfirmedObject(
    client: S3Client,
    bucket: string,
    key: string
): Promise<void> {
    try {
        await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }), {
            abortSignal: AbortSignal.timeout(S3_CLEANUP_TIMEOUT_MS),
        });
    } catch (error: unknown) {
        // A failed cleanup does not replace the upload error: it is that error
        // that must go outward, otherwise the user would learn about a
        // problem with the bucket instead of the problem with their own file
        console.warn('[S3] Failed to discard object after a failed upload:', key, error);
    }
}

/**
 * Creates the S3 implementation of IPublishAdapter with a lazy client.
 *
 * @returns The publication file storage adapter.
 */
export function createS3PublishAdapter(): IPublishAdapter {
    let client: S3Client | null = null;
    let resolvedConfig: IResolvedS3Config | null = null;

    /**
     * Lazily creates the S3 client and resolves the configuration.
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
                requestHandler: {
                    connectionTimeout: S3_CONNECTION_TIMEOUT_MS,
                    socketTimeout: S3_SOCKET_TIMEOUT_MS,
                },
                maxAttempts: S3_MAX_ATTEMPTS,
            });
        }

        return { client, config: resolvedConfig };
    }

    return {
        /**
         * Builds the full object key of a new file: the managed prefix for the
         * file's kind (`prefix` for media, `thumbnailsPrefix` for page previews,
         * `avatarsPrefix` for profile photos) + the name.
         */
        buildFileKey(kind: TPublishFileKind, filename: string): string {
            const { config } = useClient();
            const prefixByKind: Record<TPublishFileKind, string> = {
                media: config.prefix,
                thumbnail: config.thumbnailsPrefix,
                avatar: config.avatarsPrefix,
            };

            return `${prefixByKind[kind]}${filename}`;
        },

        /**
         * Uploads a file into the bucket and returns the public URL.
         * Keys outside the managed namespace are rejected — a key must
         * have been built through buildFileKey.
         *
         * A failed write is compensated right here (see the `uploadFile` contract
         * and `discardUnconfirmedObject`): the original error goes to the client, and
         * the object that could have stayed in the bucket with no link to it is
         * removed best-effort.
         */
        async uploadFile(params: IUploadFileParams): Promise<IUploadedFile> {
            const { client: s3, config } = useClient();

            if (!isManagedStorageKey(params.key, resolveManagedPrefixes(config))) {
                throw new Error(
                    'Invalid storage key: object key is outside of the managed prefixes'
                );
            }

            try {
                await s3.send(
                    new PutObjectCommand({
                        Bucket: config.bucket,
                        Key: params.key,
                        Body: params.buffer,
                        ContentType: params.mimeType,
                        ACL: 'public-read',
                    })
                );
            } catch (error: unknown) {
                // Deletion by the already checked key rather than through
                // `deleteFile(url)`: parsing the URL back would add a failure path
                // of its own where the key is already at hand
                await discardUnconfirmedObject(s3, config.bucket, params.key);

                throw error;
            }

            return {
                url: `${config.endpoint}/${config.bucket}/${params.key}`,
                key: params.key,
                size: params.buffer.length,
            };
        },

        /**
         * Deletes a file from the bucket by its public URL. A URL outside our own
         * bucket or outside the managed prefixes is an error (in a shared bucket
         * foreign objects are left alone).
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
         * Checks that the URL belongs to our own storage (the anti-SSRF contract):
         * the host is fixed by the config (`endpoint/bucket/`), and the key must lie
         * inside the managed prefixes — arbitrary origins and the foreign objects of
         * a shared bucket do not pass.
         */
        isOwnedUrl(url: string): boolean {
            const { config } = useClient();
            return extractManagedKey(url, config) !== null;
        },

        /**
         * Returns the full list of the bucket's files under a prefix (the default
         * is bricks-media/). ListObjectsV2 returns at most 1000 objects per
         * request — the pages are read on through NextContinuationToken.
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
