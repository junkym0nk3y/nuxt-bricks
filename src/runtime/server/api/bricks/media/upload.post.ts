import { randomUUID } from 'crypto';
import { createError, defineEventHandler } from 'h3';
import {
    useBricksPublishAdapter,
    useBricksStorageAdapter,
} from '../../../../modules/persistence/server/registry';
import {
    getFileExtension,
    isVideoFile,
    resolveMediaConfig,
} from '../../../../modules/persistence/server/utils/imageProcessing';
import {
    validateAndOptimizeImage,
    validateVideo,
} from '../../../../modules/persistence/server/utils/mediaProcessing';
import {
    DEFAULT_MEDIA_CATEGORY,
    uploadAndRegisterMedia,
} from '../../../../modules/persistence/server/utils/mediaOrchestration';
import { toHttpError } from '../../../../modules/persistence/server/utils/handlerHelpers';
import {
    MULTIPART_ENVELOPE_ALLOWANCE_BYTES,
    readMultipartFormDataWithLimit,
} from '../../../../modules/persistence/server/utils/requestBodyLimits';
import { validateMediaCategory } from '../../../../modules/persistence/server/utils/mediaPayloadValidation';
import { sanitizeSvgMarkup } from '../../../../modules/common/utils/sanitize/sanitizeSvg';
import {
    assertWithinRateLimit,
    createFixedWindowRateLimiter,
} from '../../../utils/requestRateLimiter';
import type {
    IResolvedMediaConfig,
    IUploadedFilePart,
} from '../../../../modules/persistence/types/media';

/** Лимит загрузок с одного IP в минуту. */
const UPLOADS_PER_MINUTE = 30;
const uploadRateLimiter = createFixedWindowRateLimiter({
    limit: UPLOADS_PER_MINUTE,
    windowMs: 60_000,
});

/** Подготовленный к загрузке файл. */
interface IPreparedUpload {
    buffer: Buffer;
    mimeType: string;
    targetExtension: string;
    svgContent: string | null;
}

/**
 * Достаёт файл из multipart-формы и валидирует наличие данных.
 *
 * @param formData - Коллекция multipart-полей.
 * @returns Найденный файл.
 */
function assertUploadedFile(formData: IUploadedFilePart[]): IUploadedFilePart {
    const file = formData.find((item) => item.name === 'file');

    if (!file || !file.data || file.data.length === 0) {
        throw createError({
            statusCode: 400,
            message: 'Invalid file data',
        });
    }

    return file;
}

/**
 * Валидирует и подготавливает файл к загрузке: видео — как есть, изображение —
 * оптимизация в webp, SVG — санитизированная разметка для предпросмотра.
 *
 * @param file - Multipart-файл.
 * @param config - Разрешённые медиа-настройки (лимиты, оптимизация).
 * @returns Буфер, MIME, расширение и svgContent.
 */
async function prepareUpload(
    file: IUploadedFilePart,
    config: IResolvedMediaConfig
): Promise<IPreparedUpload> {
    const fileExtension = getFileExtension(file.filename);

    if (isVideoFile(file.type, fileExtension)) {
        const validated = validateVideo(
            file,
            config.maxVideoUploadSizeBytes,
            config.maxVideoUploadSizeMb
        );

        return {
            buffer: validated.buffer,
            mimeType: validated.mimeType,
            targetExtension: validated.targetExtension,
            svgContent: null,
        };
    }

    const validated = await validateAndOptimizeImage(
        file,
        config.maxUploadSizeBytes,
        config.maxUploadSizeMb,
        config.optimization
    );

    return {
        buffer: validated.optimizedBuffer,
        mimeType: validated.mimeType,
        targetExtension: validated.targetExtension,
        // Inline SVG — недоверенный ввод: в БД сохраняется санитизированная разметка
        svgContent: validated.isSvg
            ? sanitizeSvgMarkup(validated.optimizedBuffer.toString())
            : null,
    };
}

/**
 * POST /api/bricks/media/upload — атомарная загрузка медиа: файл в хранилище
 * публикации + запись метаданных в БД одним запросом. Ошибка записи в БД
 * компенсируется удалением загруженного файла (см. uploadAndRegisterMedia).
 *
 * Ingress-контроль: rate limit по IP, тело читается с жёстким лимитом
 * (Content-Length pre-check + стрим-лимит), содержимое файла подтверждается
 * magic bytes в validate*-хелперах.
 *
 * Multipart-поля: `file` (обязателен), `category` (опционален, дефолт 'other').
 */
export default defineEventHandler(async (event) => {
    try {
        assertWithinRateLimit(event, uploadRateLimiter, 'Too many media uploads');

        const config = resolveMediaConfig();
        const bodyLimitBytes =
            Math.max(config.maxUploadSizeBytes, config.maxVideoUploadSizeBytes) +
            MULTIPART_ENVELOPE_ALLOWANCE_BYTES;
        const formData = await readMultipartFormDataWithLimit(event, bodyLimitBytes);

        if (formData.length === 0) {
            throw createError({
                statusCode: 400,
                message: 'No file uploaded',
            });
        }

        const file = assertUploadedFile(formData);
        const rawCategory = formData.find((item) => item.name === 'category')?.data.toString();
        const category = rawCategory ? validateMediaCategory(rawCategory) : DEFAULT_MEDIA_CATEGORY;

        const prepared = await prepareUpload(file, config);
        const storedFilename = `${randomUUID()}.${prepared.targetExtension}`;

        return await uploadAndRegisterMedia(
            { storage: useBricksStorageAdapter(), publish: useBricksPublishAdapter() },
            {
                buffer: prepared.buffer,
                mimeType: prepared.mimeType,
                storedFilename,
                displayFilename: file.filename || storedFilename,
                category,
                svgContent: prepared.svgContent,
            }
        );
    } catch (error: unknown) {
        toHttpError(error, 'Failed to upload media file');
    }
});
