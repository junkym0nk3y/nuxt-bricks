/**
 * Оркестрация парных операций «файл хранилища + запись БД» для медиа.
 *
 * Сервер владеет обеими половинами операции целиком (клиент делает один
 * запрос) — прежний двухэтапный клиентский флоу (mock-api/s3-* + /api/bricks/media)
 * оставлял сирот при падении второго шага и рапортовал успех при ошибке.
 *
 * Зависимости передаются параметром (узкие Pick-контракты) — логика
 * тестируется юнитами без реальных Postgres/S3.
 */
import { createError } from 'h3';
import type { IMediaItem } from '../../../common/types/media';
import type { IPublishAdapter, IStorageAdapter } from '../../types/adapters';

/** Категория медиа по умолчанию (когда клиент не передал свою). */
export const DEFAULT_MEDIA_CATEGORY = 'other';

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
    category: string;
    /** Уже санитизированная SVG-разметка (политика записи — на ручке). */
    svgContent?: string | null;
}

/**
 * Загружает файл в хранилище публикации и регистрирует метаданные в БД.
 * При падении записи в БД файл-сирота компенсируется best-effort удалением.
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

    try {
        return await deps.storage.createMedia({
            url: uploaded.url,
            filename: params.displayFilename,
            size: uploaded.size,
            mimeType: params.mimeType,
            category: params.category,
            svgContent: params.svgContent ?? null,
        });
    } catch (error: unknown) {
        // Компенсация: запись не создана — файл не должен остаться сиротой
        try {
            await deps.publish.deleteFile(uploaded.url);
        } catch (cleanupError: unknown) {
            console.error(
                '[Media Orchestration] Failed to cleanup uploaded file after DB error:',
                cleanupError
            );
        }

        throw error;
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
