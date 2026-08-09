// #region Imports
import { createError } from 'h3';
import type {
    IOptimizedImage,
    IUploadedFilePart,
    IValidatedImage,
    IValidatedVideo,
    TMediaVariant,
} from '../../types/media';
import type { IBricksMediaOptimization } from '../../../common/types/media';
import {
    looksLikeSvgMarkup,
    sniffImageFormat,
    sniffVideoFormat,
    type TSniffedImageFormat,
} from './fileSignatures';
import { collectWebStreamWithLimit } from './requestBodyLimits';
import {
    getFileExtension,
    isAnimatedImage,
    isImageFile,
    isSvgFile,
    isVideoFile,
    isWebSafeImageExtension,
    optimizeImage,
    readImageDimensions,
    resolveImageMime,
    resolveVideoMime,
    toBuffer,
} from './imageProcessing';
import { MEDIA_VARIANT_PRESETS } from './mediaVariants';
// #endregion

// #region Constants
/**
 * Расширение объекта по распознанному содержимому. HEIF и TIFF/BMP здесь есть,
 * хотя как есть они не сохраняются: значение нужно, чтобы решить web-safe'ность
 * по содержимому, а не по имени. `svg` сюда не попадает — вектор обрабатывается
 * отдельной ветвью.
 */
/** Контейнеры ISO-BMFF: одна сигнатура, разные расширения (`mp4`, `mov`, `m4v`). */
const ISO_BMFF_EXTENSIONS = new Set(['mp4', 'mov', 'm4v']);
const SNIFFED_FORMAT_EXTENSIONS: Record<TSniffedImageFormat, string> = {
    jpeg: 'jpg',
    png: 'png',
    gif: 'gif',
    webp: 'webp',
    avif: 'avif',
    tiff: 'tiff',
    bmp: 'bmp',
    heif: 'heic',
    svg: 'svg',
};

/**
 * Форматы, у которых кадров может быть больше одного.
 *
 * Проверка анимации — отдельный проход sharp по метаданным, то есть ещё один
 * слот общего семафора на каждую загрузку. У JPEG и PNG результат заведомо
 * «один кадр», поэтому спрашивать про них нечего: без этого списка обычная
 * загрузка фотографии занимала два слота вместо одного.
 */
const ANIMATABLE_SNIFFED_FORMATS = new Set<TSniffedImageFormat>(['gif', 'webp', 'avif']);

/** Таймаут чтения SVG-содержимого из хранилища (мс). */
const SVG_FETCH_TIMEOUT_MS = 10_000;
/** Лимит размера SVG-содержимого, сохраняемого в БД для предпросмотра. */
const MAX_SVG_CONTENT_BYTES = 2 * 1024 * 1024;
/** Сколько байт головы файла декодировать для текстовой SVG-проверки. */
const SVG_SNIFF_BYTES = 4096;
// #endregion

/**
 * Определяет MIME по имени файла (используется для импортов из S3).
 * @param filename Имя файла.
 */
export function detectMimeTypeByFilename(filename: string): string {
    const extension = filename.split('.').pop()?.toLowerCase();

    if (!extension) {
        return 'image/png';
    }

    if (extension === 'svg') {
        return 'image/svg+xml';
    }

    if (extension === 'jpg' || extension === 'jpeg') {
        return 'image/jpeg';
    }

    if (extension === 'png') {
        return 'image/png';
    }

    if (extension === 'webp') {
        return 'image/webp';
    }

    return 'image/png';
}

/**
 * Забирает содержимое SVG по URL, чтобы сохранить в БД для предпросмотра.
 * Читает с таймаутом, без редиректов и с жёстким лимитом размера — URL
 * приходит из собственного хранилища, но ресурсные границы обязательны.
 * @param url Публичная ссылка на файл.
 */
export async function fetchSvgContent(url: string): Promise<string | undefined> {
    try {
        const response = await fetch(url, {
            redirect: 'error',
            signal: AbortSignal.timeout(SVG_FETCH_TIMEOUT_MS),
        });

        if (!response.ok || !response.body) {
            return undefined;
        }

        const buffer = await collectWebStreamWithLimit(
            response.body,
            MAX_SVG_CONTENT_BYTES,
            () => new Error(`SVG content exceeds ${MAX_SVG_CONTENT_BYTES} bytes limit`)
        );

        return buffer.toString('utf8');
    } catch (error) {
        console.warn('[Media] Failed to fetch SVG content for', url, error);
        return undefined;
    }
}

/**
 * Проверяет соответствие содержимого заявленному классу «изображение»
 * по magic bytes: SVG — текстовая эвристика корневого тега, растровые —
 * сигнатура известного формата (MIME и расширению не доверяем).
 *
 * @param fileBuffer Байты файла.
 * @param isSvg Файл заявлен как SVG.
 */
function assertImageContentSignature(
    fileBuffer: Buffer,
    isSvg: boolean
): TSniffedImageFormat | null {
    if (isSvg) {
        const head = fileBuffer.toString('utf8', 0, Math.min(fileBuffer.length, SVG_SNIFF_BYTES));

        if (!looksLikeSvgMarkup(head)) {
            throw createError({
                statusCode: 400,
                message: 'File content is not a valid SVG image',
            });
        }

        return null;
    }

    const sniffed = sniffImageFormat(fileBuffer);

    if (!sniffed || sniffed === 'svg') {
        throw createError({
            statusCode: 400,
            message: 'File content is not a supported image',
        });
    }

    return sniffed;
}

/**
 * Генерирует уменьшенные варианты для постепенной загрузки.
 *
 * Варианты всегда webp, независимо от формата полного файла: их задача —
 * показаться в любом браузере до того, как приедет полный, и привязывать их к
 * выбранному формату (в пределе — к «Оригиналу» в HEIC) означало бы потерять
 * весь смысл. Отказ отдельного варианта не роняет загрузку: без варианта
 * потребитель честно покажет полный файл сразу, а без файла показывать нечего.
 *
 * @param buffer Исходные байты изображения.
 * @returns Готовые варианты; отсутствующий ключ — вариант не удалось построить.
 */
async function buildImageVariants(
    buffer: Buffer
): Promise<Partial<Record<TMediaVariant, IOptimizedImage>>> {
    const variants: Partial<Record<TMediaVariant, IOptimizedImage>> = {};

    for (const variant of Object.keys(MEDIA_VARIANT_PRESETS) as TMediaVariant[]) {
        try {
            variants[variant] = await optimizeImage(buffer, MEDIA_VARIANT_PRESETS[variant]);
        } catch (error) {
            // 503 занятого семафора пробрасываем: сервер перегружен, и полный
            // файл тем же путём тоже не пройдёт
            if (error && typeof error === 'object' && 'statusCode' in error) {
                throw error;
            }

            console.warn(`[Media Upload] Failed to build "${variant}" variant:`, error);
        }
    }

    return variants;
}

/**
 * Готовит полный файл: перекодирует в выбранный формат либо сохраняет как есть.
 *
 * «Как есть» — три случая: SVG (растровой обработке не подлежит), запрошенный
 * «Оригинал» у web-safe входа и анимация (sharp взял бы первый кадр, то есть
 * молча убил бы анимацию). Не-web-safe вход конвертируется даже при запросе
 * «Оригинала» — иначе постепенная загрузка подменяла бы видимое webp-превью
 * файлом, который браузер не откроет.
 *
 * @param buffer Исходные байты изображения.
 * @param extension Расширение входного файла.
 * @param fileType MIME из загрузки.
 * @param optimization Настройки оптимизации.
 * @returns Байты полного файла с MIME, расширением и размерами.
 */
async function prepareFullImage(
    buffer: Buffer,
    sniffedFormat: TSniffedImageFormat,
    optimization: IBricksMediaOptimization
): Promise<IOptimizedImage> {
    // Расширение и MIME выводятся из СОДЕРЖИМОГО, а не из имени файла: имя
    // приходит от клиента, и PNG, названный `photo.gif`, сохранялся бы как
    // `*.gif` с `image/gif` — сигнатуру мы при этом проверяли и результат
    // выбрасывали
    const extension = SNIFFED_FORMAT_EXTENSIONS[sniffedFormat];
    const isWebSafe = Boolean(extension) && isWebSafeImageExtension(extension);
    const keepAsIs =
        isWebSafe &&
        (optimization.format === 'original' ||
            (ANIMATABLE_SNIFFED_FORMATS.has(sniffedFormat) && (await isAnimatedImage(buffer))));

    if (keepAsIs) {
        const { width, height } = await readImageDimensions(buffer);

        return {
            buffer,
            mimeType: resolveImageMime(extension),
            extension,
            width,
            height,
        };
    }

    // 'original' сюда доходит только для не-web-safe входа: конвертация
    // обязательна, и перекодирование в проекте одно — webp
    return optimizeImage(buffer, {
        quality: optimization.quality,
        maxWidth: optimization.maxWidth,
    });
}

/**
 * Валидирует тип/размер/сигнатуру, готовит полный файл и уменьшенные варианты
 * (SVG не трогаем — ни оптимизации, ни вариантов).
 *
 * @param file Загруженный multipart-файл.
 * @param maxUploadSizeBytes Лимит размера в байтах.
 * @param maxUploadSizeMb Лимит в мегабайтах (для сообщения).
 * @param optimization Настройки оптимизации.
 */
export async function validateAndOptimizeImage(
    file: IUploadedFilePart,
    maxUploadSizeBytes: number,
    maxUploadSizeMb: number,
    optimization: IBricksMediaOptimization
): Promise<IValidatedImage> {
    const originalExtension = getFileExtension(file.filename);
    const fileBuffer = toBuffer(file.data);

    if (!isImageFile(file.type, originalExtension)) {
        throw createError({
            statusCode: 400,
            message: 'Only image uploads are supported',
        });
    }

    if (fileBuffer.length > maxUploadSizeBytes) {
        throw createError({
            statusCode: 413,
            message: `File is too large. Maximum allowed size is ${Math.floor(maxUploadSizeMb)}MB`,
        });
    }

    const normalizedExtension = originalExtension || '';
    const isSvg = isSvgFile(file.type, normalizedExtension);
    const sniffedFormat = assertImageContentSignature(fileBuffer, isSvg);

    if (isSvg || !sniffedFormat) {
        return {
            optimizedBuffer: fileBuffer,
            mimeType: file.type || 'image/svg+xml',
            targetExtension: normalizedExtension || 'svg',
            isSvg: true,
            width: null,
            height: null,
            variants: {},
        };
    }

    try {
        const full = await prepareFullImage(fileBuffer, sniffedFormat, optimization);

        return {
            optimizedBuffer: full.buffer,
            mimeType: full.mimeType,
            targetExtension: full.extension,
            isSvg: false,
            width: full.width,
            height: full.height,
            variants: await buildImageVariants(fileBuffer),
        };
    } catch (error) {
        // h3-ошибки (503 занятого семафора) пробрасываем со своим статусом
        if (error && typeof error === 'object' && 'statusCode' in error) {
            throw error;
        }

        console.error('[Media Upload] Optimization error:', error);

        throw createError({
            statusCode: 400,
            message: 'Failed to optimize image before upload',
        });
    }
}

/**
 * Валидирует тип/размер/сигнатуру видеофайла. Видео не оптимизируется — загружается как есть.
 * @param file Загруженный multipart-файл.
 * @param maxVideoUploadSizeBytes Лимит размера в байтах.
 * @param maxVideoUploadSizeMb Лимит в мегабайтах (для сообщения).
 */
export function validateVideo(
    file: IUploadedFilePart,
    maxVideoUploadSizeBytes: number,
    maxVideoUploadSizeMb: number
): IValidatedVideo {
    const extension = getFileExtension(file.filename);
    const fileBuffer = toBuffer(file.data);

    if (!isVideoFile(file.type, extension)) {
        throw createError({
            statusCode: 400,
            message: 'Unsupported video format',
        });
    }

    if (fileBuffer.length > maxVideoUploadSizeBytes) {
        throw createError({
            statusCode: 413,
            message: `Video is too large. Maximum allowed size is ${Math.floor(maxVideoUploadSizeMb)}MB`,
        });
    }

    const sniffedFormat = sniffVideoFormat(fileBuffer);

    if (!sniffedFormat) {
        throw createError({
            statusCode: 400,
            message: 'File content is not a supported video',
        });
    }

    // Контейнер берётся из содержимого, а не из имени: WebM, названный
    // `clip.mp4`, уезжал в бакет как `*.mp4` с `video/mp4`, и плеер получал
    // Content-Type, не совпадающий с байтами. `mov` — тот же ISO-BMFF, что mp4,
    // и различить их сигнатурой нельзя, поэтому имя уважается внутри одной
    // группы контейнеров
    const targetExtension =
        sniffedFormat === 'mp4' && ISO_BMFF_EXTENSIONS.has(extension) ? extension : sniffedFormat;
    const mimeType = resolveVideoMime(targetExtension, file.type);

    return {
        buffer: fileBuffer,
        mimeType,
        targetExtension,
    };
}
