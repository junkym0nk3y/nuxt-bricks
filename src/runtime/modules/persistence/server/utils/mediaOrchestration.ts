/**
 * Оркестрация парных операций «файл хранилища + запись БД» для медиа.
 *
 * Сервер владеет обеими половинами операции целиком (клиент делает один
 * запрос) — прежний двухэтапный клиентский флоу (s3-ручки + /api/bricks/media)
 * оставлял сирот при падении второго шага и рапортовал успех при ошибке.
 *
 * Зависимости передаются параметром (узкие Pick-контракты) — логика
 * тестируется юнитами без реальных Postgres/S3.
 */
import { createError } from 'h3';
import type { IMediaItem } from '../../../common/types/media';
import type { ICreateMediaPayload, IPublishAdapter, IStorageAdapter } from '../../types/adapters';
import type { IUploadMediaVariant, TMediaVariant } from '../../types/media';
import { BricksStorageWriteRejectedError } from './storageErrors';

/**
 * Зависимости оркестрации медиа.
 */
export interface IMediaOrchestrationDeps {
    storage: Pick<IStorageAdapter, 'getMedia' | 'createMedia' | 'deleteMedia'>;
    publish: Pick<IPublishAdapter, 'buildFileKey' | 'uploadFile' | 'deleteFile' | 'isOwnedUrl'>;
}

/**
 * Параметры регистрации загруженного медиа-файла.
 */
export interface IUploadMediaParams {
    /** Готовый к загрузке буфер (после оптимизации/валидации). */
    buffer: Buffer;
    mimeType: string;
    /** Server-generated имя объекта (`uuid.ext`) — клиентские имена в ключ не попадают. */
    storedFilename: string;
    /** Отображаемое имя файла для медиа-библиотеки. */
    displayFilename: string;
    /** null — загрузка без выбранной категории. */
    category: string | null;
    /** Уже санитизированная SVG-разметка (политика записи — на ручке). */
    svgContent?: string | null;
    /** Пиксельные размеры полного файла; null у SVG и видео. */
    width?: number | null;
    height?: number | null;
    /** Уменьшенные варианты постепенной загрузки; пустой объект — вариантов нет. */
    variants?: Partial<Record<TMediaVariant, IUploadMediaVariant>>;
}

/**
 * Загружает вариант в хранилище публикации best-effort.
 *
 * Отказ варианта не роняет загрузку: без варианта потребитель честно покажет
 * полный файл сразу, а провалить из-за него загрузку самого файла — потерять
 * работу пользователя ради вторичного артефакта.
 *
 * @param deps - Адаптеры persistence.
 * @param variant - Готовый вариант.
 * @returns URL загруженного варианта или null при отказе.
 */
async function uploadVariantFile(
    deps: IMediaOrchestrationDeps,
    variant: IUploadMediaVariant
): Promise<string | null> {
    try {
        const uploaded = await deps.publish.uploadFile({
            buffer: variant.buffer,
            mimeType: variant.mimeType,
            key: deps.publish.buildFileKey('media', variant.storedFilename),
        });

        return uploaded.url;
    } catch (error: unknown) {
        console.warn('[Media Orchestration] Failed to upload media variant:', error);

        return null;
    }
}

/**
 * Best-effort удаление файлов вариантов.
 *
 * @param deps - Адаптеры persistence.
 * @param urls - URL вариантов (null/undefined пропускаются).
 */
async function deleteVariantFiles(
    deps: Pick<IMediaOrchestrationDeps, 'publish'>,
    urls: (string | null | undefined)[]
): Promise<void> {
    for (const url of urls) {
        if (!url || !deps.publish.isOwnedUrl(url)) {
            continue;
        }

        try {
            await deps.publish.deleteFile(url);
        } catch (error: unknown) {
            console.warn('[Media Orchestration] Failed to delete media variant file:', error);
        }
    }
}

/**
 * Компенсация загруженных файлов: запись не создана — ни полный файл, ни
 * варианты не должны остаться сиротами.
 *
 * Вызывается ТОЛЬКО под гарантию отказа записи: при неизвестном исходе удаление
 * оставило бы в БД строку, указывающую на удалённый объект.
 *
 * @param deps - Адаптеры persistence.
 * @param fullUrl - URL полного файла.
 * @param variantUrls - URL успешно загруженных вариантов.
 */
async function compensateUploadedFiles(
    deps: IMediaOrchestrationDeps,
    fullUrl: string,
    variantUrls: (string | null)[]
): Promise<void> {
    await deleteVariantFiles(deps, variantUrls);

    try {
        await deps.publish.deleteFile(fullUrl);
    } catch (cleanupError: unknown) {
        console.error(
            '[Media Orchestration] Failed to cleanup uploaded file after DB error:',
            cleanupError
        );
    }
}

/**
 * Загружает файл (и его уменьшенные варианты) в хранилище публикации и
 * регистрирует метаданные в БД.
 *
 * Судьба файлов при отказе записи решается по тому, ЧТО известно об её исходе.
 * Хранилище гарантировало отказ (`BricksStorageWriteRejectedError`) — файлы
 * компенсируются удалением. Исход неизвестен (обрыв соединения, таймаут
 * транспорта, 5xx внешнего backend'а) — прежнее безусловное удаление сносило
 * файлы из-под записи, которую backend успел закоммитить, оставляя в галерее
 * битые плитки. Поэтому здесь идёт ОДИН повтор регистрации: `createMedia`
 * идемпотентен по url (уникальный индекс плюс перечитывание строки), так что
 * повтор либо находит уже созданную запись, либо создаёт недостающую. Не помог и
 * он — файлы сохраняются, а их адреса уходят в лог: невидимый объект в бакете
 * дешевле строки, вечно указывающей на удалённый файл.
 *
 * Ошибка повтора наружу не идёт: неизвестным исход сделала ПЕРВАЯ ошибка, и
 * определённый отказ повтора (например, категорию удалили только что) ничего не
 * говорит о судьбе первой попытки — компенсировать по нему нельзя.
 *
 * @param deps - Адаптеры persistence.
 * @param params - Данные загрузки.
 * @returns Созданная медиа-запись.
 */
export async function uploadAndRegisterMedia(
    deps: IMediaOrchestrationDeps,
    params: IUploadMediaParams
): Promise<IMediaItem> {
    const key = deps.publish.buildFileKey('media', params.storedFilename);
    const uploaded = await deps.publish.uploadFile({
        buffer: params.buffer,
        mimeType: params.mimeType,
        key,
    });
    const previewVariant = params.variants?.preview;
    const mockVariant = params.variants?.mock;
    const previewUrl = previewVariant ? await uploadVariantFile(deps, previewVariant) : null;
    const mockUrl = mockVariant ? await uploadVariantFile(deps, mockVariant) : null;
    const payload: ICreateMediaPayload = {
        url: uploaded.url,
        filename: params.displayFilename,
        size: uploaded.size,
        mimeType: params.mimeType,
        category: params.category,
        svgContent: params.svgContent ?? null,
        width: params.width ?? null,
        height: params.height ?? null,
        previewUrl,
        mockUrl,
    };

    try {
        return await deps.storage.createMedia(payload);
    } catch (error: unknown) {
        if (error instanceof BricksStorageWriteRejectedError) {
            await compensateUploadedFiles(deps, uploaded.url, [previewUrl, mockUrl]);

            throw error;
        }

        try {
            return await deps.storage.createMedia(payload);
        } catch (retryError: unknown) {
            console.error(
                '[Media Orchestration] Media registration outcome is unknown, uploaded files are retained:',
                {
                    urls: [uploaded.url, previewUrl, mockUrl].filter(Boolean),
                    error,
                    retryError,
                }
            );

            throw error;
        }
    }
}

/**
 * Удаляет медиа: сначала файл хранилища, затем запись БД (file-first).
 *
 * Порядок делает операцию восстановимой: удаление объекта S3 идемпотентно,
 * поэтому после сбоя БД повторный DELETE доводит операцию до конца. Ошибка
 * хранилища — 502, запись остаётся (иначе файл стал бы невидимой сиротой).
 * URL вне собственного хранилища (внешний файл) модулем не управляется —
 * удаляется только запись.
 *
 * @param deps - Адаптеры persistence.
 * @param id - Идентификатор медиа-записи.
 * @returns false — запись не найдена; true — удалено.
 */
export async function deleteMediaWithFile(
    deps: IMediaOrchestrationDeps,
    id: number
): Promise<boolean> {
    const media = await deps.storage.getMedia(id);

    if (!media) {
        return false;
    }

    if (deps.publish.isOwnedUrl(media.url)) {
        // Варианты — раньше полного файла и best-effort: они вторичны, и
        // застрявший вариант не должен блокировать удаление самого файла. После
        // удаления записи ссылок на них не останется вовсе, поэтому порядок
        // «сначала варианты» лишь уменьшает окно, в котором они уже осиротели
        await deleteVariantFiles(deps, [media.previewUrl, media.mockUrl]);

        try {
            await deps.publish.deleteFile(media.url);
        } catch (error: unknown) {
            console.error('[Media Orchestration] Failed to delete media file:', error);
            throw createError({
                statusCode: 502,
                statusMessage: 'Failed to delete media file from storage',
            });
        }
    } else {
        console.warn(
            '[Media Orchestration] Media url is outside of the managed storage, deleting DB record only:',
            media.url
        );
    }

    return deps.storage.deleteMedia(id);
}

/**
 * Best-effort удаление файла превью удалённой страницы: превью — вторичный
 * артефакт, его ошибка не должна ронять удаление страницы. URL хранится
 * с cache-buster (`?v=`) — query отрезает политика ключей адаптера.
 *
 * @param publish - Publish-адаптер.
 * @param thumbnailUrl - Сохранённый URL превью страницы.
 */
export async function cleanupPageThumbnail(
    publish: Pick<IPublishAdapter, 'deleteFile' | 'isOwnedUrl'>,
    thumbnailUrl: string | null | undefined
): Promise<void> {
    if (!thumbnailUrl || !publish.isOwnedUrl(thumbnailUrl)) {
        return;
    }

    try {
        await publish.deleteFile(thumbnailUrl);
    } catch (error: unknown) {
        console.warn('[Media Orchestration] Failed to cleanup page thumbnail:', error);
    }
}
