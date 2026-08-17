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
import { extractStorageKey, findManagedPrefixConflict, isManagedStorageKey } from './s3KeyPolicy';
import type {
    IPublishAdapter,
    IUploadFileParams,
    IUploadedFile,
    IStoredFileInfo,
    TPublishFileKind,
} from '../../types/adapters';

/**
 * Потолок установки TCP-соединения с хранилищем (мс): недоступный endpoint
 * обязан отказать быстро — на этом ожидании стоит вся загрузка медиа.
 */
const S3_CONNECTION_TIMEOUT_MS = 5_000;
/**
 * Потолок ТИШИНЫ сокета (мс), а не всей операции: PUT'ом идут файлы до сотни
 * мегабайт, и общий потолок обрывал бы исправную загрузку по медленному каналу.
 * Без него зависший endpoint держал бы запрос насовсем — клиентский abort до
 * AWS SDK не доходит, то есть ручка загрузки не имела ни одной своей границы
 * ожидания хранилища.
 *
 * Уезжает именно в `socketTimeout`. Похожий `requestTimeout` тут ловушка: он
 * ограничивает суммарное время запроса и ответа, а без `throwOnRequestTimeout`
 * при превышении лишь пишет warning в лог, ничего не обрывая (см.
 * `@smithy/node-http-handler`). То есть зависший endpoint он не лечит, а
 * включённый как ошибка — резал бы стомегабайтную загрузку по общему времени.
 */
const S3_SOCKET_TIMEOUT_MS = 30_000;
/**
 * Всего попыток одного запроса (одна плюс повтор). Дефолтные три на зависшем
 * endpoint дают три окна тишины подряд плюс backoff — до полутора минут ожидания
 * на интерактивной загрузке; одного повтора хватает, чтобы пережить одиночный
 * сетевой сбой, а тело запроса повторяемо (Buffer) и ключ всегда новый.
 */
const S3_MAX_ATTEMPTS = 2;
/**
 * Потолок компенсирующего удаления (мс). Своя граница нужна потому, что уборка
 * идёт тем же клиентом с теми же ретраями: без неё исходная ошибка загрузки
 * возвращалась бы наружу ещё через окна тишины уборки.
 */
const S3_CLEANUP_TIMEOUT_MS = 10_000;

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
    avatarsPrefix: string;
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

    const prefix = raw?.prefix || 'bricks-media/';
    const thumbnailsPrefix = raw?.thumbnailsPrefix || 'bricks-thumbnails/';
    const avatarsPrefix = raw?.avatarsPrefix || 'bricks-avatars/';

    // Изоляция namespace'ов держится только на непересечении префиксов, а
    // значения переопределяются NUXT_BRICKS_S3_* уже в рантайме — build-time
    // проверка их не увидела бы. Отказ громкий: молча работающая конфигурация, в
    // которой аватары попадают в листинг медиатеки, нарушает обещание модуля
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
 * Managed-префиксы ключей модуля в бакете: только внутри них адаптер
 * создаёт и удаляет объекты (см. контракт IPublishAdapter).
 *
 * Аватары входят в набор, потому что иначе адаптер не смог бы ни записать, ни
 * удалить их файл (`uploadFile` и `deleteFile` отказывают ключам вне
 * namespace). Медиатека от этого не наполняется: импорт бакета читает только
 * `prefix`, а записи медиа создаёт загрузка со своим ключом.
 *
 * @param config - Конфигурация хранилища.
 * @returns Список префиксов.
 */
function resolveManagedPrefixes(config: IResolvedS3Config): string[] {
    return [config.prefix, config.thumbnailsPrefix, config.avatarsPrefix];
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
 * Best-effort уборка объекта, чья запись завершилась неизвестно чем.
 *
 * Отказ PUT не доказывает, что объекта в бакете нет: ответ мог потеряться или
 * упереться в таймаут уже после записи. Вызывающий URL при этом не получил, то
 * есть удалить объект ему нечем и ссылки на него не появится никогда — уборка
 * возможна только здесь. Своя граница ожидания обязательна: без неё исходная
 * ошибка загрузки ждала бы ещё и ретраев уборки.
 *
 * @param client - S3-клиент.
 * @param bucket - Бакет хранилища.
 * @param key - Ключ объекта, который могли записать.
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
        // Отказ уборки не заменяет ошибку загрузки: наружу обязана уйти именно
        // она, иначе пользователь узнает о проблеме с бакетом вместо проблемы
        // со своим файлом
        console.warn('[S3] Failed to discard object after a failed upload:', key, error);
    }
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
         * Строит полный object key нового файла: managed-префикс по типу файла
         * (`prefix` для медиа, `thumbnailsPrefix` для превью страниц,
         * `avatarsPrefix` для фото профиля) + имя.
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
         * Загружает файл в бакет и возвращает публичный URL.
         * Ключи вне managed namespace отклоняются — ключ обязан быть построен
         * через buildFileKey.
         *
         * Отказ записи компенсируется здесь же (см. контракт `uploadFile` и
         * `discardUnconfirmedObject`): наружу уходит исходная ошибка, а объект,
         * который мог остаться в бакете без ссылки, убирается best-effort.
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
                // Удаление по уже проверенному ключу, а не через `deleteFile(url)`:
                // обратный разбор URL добавил бы свой путь отказа там, где ключ
                // и так на руках
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
