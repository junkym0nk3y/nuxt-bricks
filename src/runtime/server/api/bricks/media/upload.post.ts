import { randomUUID } from 'crypto';
import { createError, defineEventHandler } from 'h3';
import {
    useBricksPublishAdapter,
    useBricksStorageAdapter,
} from '../../../../modules/persistence/server/registry';
import {
    getFileExtension,
    isVideoFile,
} from '../../../../modules/persistence/server/utils/imageProcessing';
import {
    resolveMediaConfig,
    resolveRequestedOptimization,
} from '../../../../modules/persistence/server/utils/mediaConfig';
import {
    validateAndOptimizeImage,
    validateVideo,
} from '../../../../modules/persistence/server/utils/mediaProcessing';
import { uploadAndRegisterMedia } from '../../../../modules/persistence/server/utils/mediaOrchestration';
import { buildMediaVariantFilename } from '../../../../modules/persistence/server/utils/mediaVariants';
import { toMediaHttpError } from '../../../../modules/persistence/server/utils/handlerHelpers';
import {
    MULTIPART_ENVELOPE_ALLOWANCE_BYTES,
    withMultipartFormData,
} from '../../../../modules/persistence/server/utils/requestBodyLimits';
import { validateMediaCategory } from '../../../../modules/persistence/server/utils/mediaPayloadValidation';
import { assertKnownMediaCategory } from '../../../../modules/persistence/server/utils/mediaCategoryRules';
import { sanitizeSvgMarkup } from '../../../../modules/common/utils/sanitize/sanitizeSvg';
import {
    assertWithinRateLimit,
    createFixedWindowRateLimiter,
} from '../../../utils/requestRateLimiter';
import type {
    IPreparedUpload,
    IResolvedMediaConfig,
    IUploadedFilePart,
    IUploadMediaVariant,
    IValidatedImage,
    TMediaVariant,
} from '../../../../modules/persistence/types/media';
import type { IBricksMediaOptimization } from '../../../../modules/common/types/media';

/** Лимит загрузок с одного IP в минуту. */
const UPLOADS_PER_MINUTE = 30;
const uploadRateLimiter = createFixedWindowRateLimiter({
    limit: UPLOADS_PER_MINUTE,
    windowMs: 60_000,
});

/**
 * Читает переопределения параметров оптимизации из multipart-полей и накрывает
 * ими дефолты конфига.
 *
 * Параметры приходят с формой, а не из конфига, потому что выбираются в
 * поповере на каждую загрузку; конфиг остаётся источником дефолтов. Разбор,
 * подстановку дефолта и границы держит `resolveRequestedOptimization` — здесь
 * остаётся только достать строки, потому что отличать «поля не было» от
 * «пришло непригодное» обязан тот, кто применяет границы.
 *
 * @param formData - Коллекция multipart-полей.
 * @param fallback - Параметры из конфига.
 * @returns Эффективные параметры оптимизации.
 */
function resolveUploadOptimization(
    formData: IUploadedFilePart[],
    fallback: IBricksMediaOptimization
): IBricksMediaOptimization {
    const readField = (name: string): string | undefined =>
        formData.find((item) => item.name === name)?.data.toString();

    return resolveRequestedOptimization(
        {
            format: readField('format'),
            quality: readField('quality'),
            maxWidth: readField('maxWidth'),
        },
        fallback
    );
}

/**
 * Достраивает вариантам имена объектов рядом с полным файлом.
 *
 * @param variants - Готовые байты вариантов.
 * @param storedFilename - Имя объекта полного файла.
 * @returns Варианты с именами объектов.
 */
function withVariantFilenames(
    variants: IValidatedImage['variants'],
    storedFilename: string
): Partial<Record<TMediaVariant, IUploadMediaVariant>> {
    const result: Partial<Record<TMediaVariant, IUploadMediaVariant>> = {};

    for (const [variant, image] of Object.entries(variants) as [
        TMediaVariant,
        NonNullable<IValidatedImage['variants'][TMediaVariant]>,
    ][]) {
        result[variant] = {
            buffer: image.buffer,
            mimeType: image.mimeType,
            storedFilename: buildMediaVariantFilename(storedFilename, variant, image.extension),
        };
    }

    return result;
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
 * оптимизация в выбранный формат плюс уменьшенные варианты, SVG —
 * санитизированная разметка для предпросмотра.
 *
 * @param file - Multipart-файл.
 * @param config - Разрешённые медиа-настройки (лимиты, оптимизация).
 * @param optimization - Эффективные параметры оптимизации (конфиг + форма).
 * @returns Буфер, MIME, расширение, svgContent, размеры и варианты.
 */
export async function prepareUpload(
    file: IUploadedFilePart,
    config: IResolvedMediaConfig,
    optimization: IBricksMediaOptimization = config.optimization
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
            width: null,
            height: null,
            variants: {},
        };
    }

    const validated = await validateAndOptimizeImage(
        file,
        config.maxUploadSizeBytes,
        config.maxUploadSizeMb,
        optimization
    );

    if (!validated.isSvg) {
        return {
            buffer: validated.optimizedBuffer,
            mimeType: validated.mimeType,
            targetExtension: validated.targetExtension,
            svgContent: null,
            width: validated.width,
            height: validated.height,
            variants: validated.variants,
        };
    }

    // Inline SVG — недоверенный ввод: в БД и в бакет уходит один и тот же
    // санитизированный буфер (прежде в S3 летел исходный, непроверенный)
    const sanitizedSvg = sanitizeSvgMarkup(validated.optimizedBuffer.toString('utf8'));

    return {
        buffer: Buffer.from(sanitizedSvg, 'utf8'),
        mimeType: validated.mimeType,
        targetExtension: validated.targetExtension,
        svgContent: sanitizedSvg,
        width: null,
        height: null,
        variants: {},
    };
}

/**
 * POST /api/bricks/media/upload — атомарная загрузка медиа: файл в хранилище
 * публикации + запись метаданных в БД одним запросом. Ошибка записи в БД
 * компенсируется удалением загруженного файла (см. uploadAndRegisterMedia).
 *
 * Ingress-контроль: rate limit по IP, тело читается с жёстким лимитом
 * (Content-Length pre-check + стрим-лимит) и в пределах общего бюджета
 * одновременно буферизуемых форм — лимит в минуту не ограничивает число
 * ОДНОВРЕМЕННЫХ загрузок, а тело каждой собирается в память целиком. Содержимое
 * файла подтверждается magic bytes в validate*-хелперах; свой потолок размера
 * каждого типа они же и проверяют — до разбора формы тип файла неизвестен.
 *
 * Multipart-поля: `file` (обязателен), `category` (опционален — отсутствие поля
 * и пустое значение одинаково означают файл без категории, `null`),
 * `format` / `quality` / `maxWidth` (опциональны — переопределяют дефолты
 * `bricks.media.optimization` на эту загрузку).
 */
export default defineEventHandler(async (event) => {
    try {
        assertWithinRateLimit(event, uploadRateLimiter, 'Too many media uploads');

        const config = resolveMediaConfig();
        const bodyLimitBytes =
            Math.max(config.maxUploadSizeBytes, config.maxVideoUploadSizeBytes) +
            MULTIPART_ENVELOPE_ALLOWANCE_BYTES;

        // Вся обработка идёт ВНУТРИ колбэка: место в бюджете одновременного
        // буферизования держится, пока буферы формы живы, — а живы они до конца
        // заливки в хранилище
        return await withMultipartFormData(event, bodyLimitBytes, async (formData) => {
            if (formData.length === 0) {
                throw createError({
                    statusCode: 400,
                    message: 'No file uploaded',
                });
            }

            const file = assertUploadedFile(formData);
            const rawCategory = formData.find((item) => item.name === 'category')?.data.toString();
            // Пустая форма-поле и отсутствие поля — одно и то же: загрузка без
            // выбранной категории, файл остаётся без неё
            const category = rawCategory ? validateMediaCategory(rawCategory) : null;
            const storage = useBricksStorageAdapter();

            // До обработки файла: тратить sharp и заливку в бакет на вход, который
            // всё равно некуда записать, незачем. Гонку с удалением категории эта
            // проверка не закрывает — её ловит FK базы уже после заливки
            if (category) {
                await assertKnownMediaCategory(storage, category);
            }

            const prepared = await prepareUpload(
                file,
                config,
                resolveUploadOptimization(formData, config.optimization)
            );
            const storedFilename = `${randomUUID()}.${prepared.targetExtension}`;

            return await uploadAndRegisterMedia(
                { storage, publish: useBricksPublishAdapter() },
                {
                    buffer: prepared.buffer,
                    mimeType: prepared.mimeType,
                    storedFilename,
                    displayFilename: file.filename || storedFilename,
                    category,
                    svgContent: prepared.svgContent,
                    width: prepared.width,
                    height: prepared.height,
                    variants: withVariantFilenames(prepared.variants, storedFilename),
                }
            );
        });
    } catch (error: unknown) {
        toMediaHttpError(error, 'Failed to upload media file');
    }
});
