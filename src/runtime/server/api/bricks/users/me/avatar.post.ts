// #region Imports
import { createError, defineEventHandler } from 'h3';
import {
    useBricksAuthAdapter,
    useBricksPublishAdapter,
} from '../../../../../modules/persistence/server/registry';
import {
    buildAvatarKey,
    discardAvatarFile,
} from '../../../../../modules/persistence/server/utils/avatarFiles';
import { sniffImageFormat } from '../../../../../modules/persistence/server/utils/fileSignatures';
import {
    cropSquareImage,
    readOrientedImageDimensions,
    toBuffer,
} from '../../../../../modules/persistence/server/utils/imageProcessing';
import {
    MULTIPART_ENVELOPE_ALLOWANCE_BYTES,
    withMultipartFormData,
} from '../../../../../modules/persistence/server/utils/requestBodyLimits';
import { toHttpError } from '../../../../../modules/persistence/server/utils/handlerHelpers';
import {
    assertProfileAvailable,
    requireSessionUser,
    toAuthProfileUser,
} from '../../../../utils/auth/profile';
// Потолок размера общий с формой профиля: она печатает его в подсказке и
// отсекает по нему файл до отправки (modules/common/constants/auth.ts)
import { BRICKS_AVATAR_MAX_UPLOAD_MB } from '../../../../../modules/common/constants/auth';
import {
    assertWithinRateLimit,
    createFixedWindowRateLimiter,
} from '../../../../utils/requestRateLimiter';
import type {
    IImageCropFrame,
    IUploadedFilePart,
} from '../../../../../modules/persistence/types/media';
// #endregion

// #region Constants
/** Сторона готового аватара (px): один файл на все размеры показа. */
const AVATAR_SIZE_PX = 256;

/** Качество webp-кодирования аватара. */
const AVATAR_WEBP_QUALITY = 82;

/**
 * Минимальная сторона рамки (px). Меньше — не кадрирование, а увеличение
 * нескольких пикселей до 256: результат нечитаем, а причина пользователю
 * непонятна. Лучше отказать с внятным текстом.
 */
const MIN_CROP_SIDE_PX = 32;

/** Лимит загрузок аватара с одного IP в минуту (каждая — проход sharp). */
const AVATAR_UPLOADS_PER_MINUTE = 20;
const avatarRateLimiter = createFixedWindowRateLimiter({
    limit: AVATAR_UPLOADS_PER_MINUTE,
    windowMs: 60_000,
});
// #endregion

// #region Helpers
/**
 * Достаёт файл фото из multipart-формы и проверяет размер и содержимое.
 *
 * Содержимое подтверждается сигнатурой, а не MIME и не расширением: заявить
 * `image/png` может кто угодно. SVG отклоняется явно — вектор в аватаре означал
 * бы недоверенную разметку, которую пришлось бы санитизировать и отдавать как
 * документ, тогда как весь смысл этой ручки в том, что наружу уходит растр,
 * пережатый sharp.
 *
 * @param formData - Коллекция multipart-полей.
 * @returns Найденный файл.
 */
function assertAvatarFile(formData: IUploadedFilePart[]): IUploadedFilePart {
    const file = formData.find((item) => item.name === 'file');

    if (!file || !file.data || file.data.length === 0) {
        throw createError({
            statusCode: 400,
            message: 'Invalid file data',
        });
    }

    if (file.data.length > BRICKS_AVATAR_MAX_UPLOAD_MB * 1024 * 1024) {
        throw createError({
            statusCode: 413,
            message: `Avatar exceeds ${BRICKS_AVATAR_MAX_UPLOAD_MB}MB limit`,
        });
    }

    const sniffed = sniffImageFormat(toBuffer(file.data));

    if (!sniffed || sniffed === 'svg') {
        throw createError({
            statusCode: 400,
            message: 'Avatar content is not a supported raster image',
        });
    }

    return file;
}

/**
 * Читает неотрицательное целое поле формы.
 *
 * @param formData - Коллекция multipart-полей.
 * @param name - Имя поля.
 * @returns Значение поля.
 */
function requireIntegerField(formData: IUploadedFilePart[], name: string): number {
    const raw = formData.find((item) => item.name === name)?.data.toString();
    const value = Number(raw);

    if (!Number.isInteger(value) || value < 0) {
        throw createError({
            statusCode: 400,
            message: `Field "${name}" must be a non-negative integer`,
        });
    }

    return value;
}

/**
 * Читает рамку кадрирования из полей формы.
 *
 * Рамка обязательна, а не «по умолчанию центр»: центр фотографии почти никогда
 * не совпадает с лицом, и молчаливый кроп по центру выдавал бы потерю рамки
 * (например, из-за правки формы) за нормальный результат — человек увидел бы
 * чужое кадрирование и не понял, почему.
 *
 * @param formData - Коллекция multipart-полей.
 * @returns Квадратная рамка в координатах ориентированного изображения.
 */
function requireCropFrame(formData: IUploadedFilePart[]): IImageCropFrame {
    const side = requireIntegerField(formData, 'cropSide');

    if (side < MIN_CROP_SIDE_PX) {
        throw createError({
            statusCode: 400,
            message: `Field "cropSide" must be at least ${MIN_CROP_SIDE_PX} pixels`,
        });
    }

    return {
        left: requireIntegerField(formData, 'cropX'),
        top: requireIntegerField(formData, 'cropY'),
        side,
    };
}

/**
 * Проверяет, что рамка целиком лежит внутри изображения.
 *
 * Своя проверка, а не отказ sharp: `extract` за краем бросает
 * `extract_area: bad extract area`, и наружу это ушло бы как «не удалось
 * обработать изображение» — по такому тексту нельзя понять, что виновата рамка.
 *
 * @param frame - Рамка кадрирования.
 * @param width - Ширина изображения с учётом EXIF-ориентации.
 * @param height - Высота изображения с учётом EXIF-ориентации.
 */
function assertFrameWithinImage(frame: IImageCropFrame, width: number, height: number): void {
    if (frame.left + frame.side > width || frame.top + frame.side > height) {
        throw createError({
            statusCode: 400,
            message: `Crop frame is outside the image (${width}x${height})`,
        });
    }
}
// #endregion

/**
 * POST /api/bricks/users/me/avatar — фото своего профиля (любая роль).
 *
 * Принимает исходный файл и рамку кадрирования (`cropX`, `cropY`, `cropSide` в
 * пикселях изображения, как его видит браузер — с применённой EXIF-ориентацией),
 * кладёт в хранилище ОДИН webp 256×256 и ставит ссылку на него в учётку.
 *
 * Через медиатеку фото не идёт: попади аватары в галерею, любой редактор увидел
 * бы их среди рабочих файлов и мог удалить чужое фото. Отсюда и свой
 * managed-префикс хранилища.
 *
 * Порядок обязателен: сначала запись новой ссылки, потом удаление прежнего файла.
 * Обратный порядок оставлял бы учётку со ссылкой на удалённый объект, если запись
 * откажет, — то есть пустой квадрат вместо прежнего фото.
 */
export default defineEventHandler(async (event) => {
    try {
        assertProfileAvailable(event);

        const sessionUser = requireSessionUser(event);

        assertWithinRateLimit(event, avatarRateLimiter, 'Too many avatar uploads');

        const bodyLimitBytes =
            BRICKS_AVATAR_MAX_UPLOAD_MB * 1024 * 1024 + MULTIPART_ENVELOPE_ALLOWANCE_BYTES;

        // Обработка внутри колбэка: место в бюджете одновременного буферизования
        // держится, пока живы буферы формы, — то есть до конца заливки файла
        return await withMultipartFormData(event, bodyLimitBytes, async (formData) => {
            if (formData.length === 0) {
                throw createError({
                    statusCode: 400,
                    message: 'No file uploaded',
                });
            }

            const file = assertAvatarFile(formData);
            const frame = requireCropFrame(formData);
            const source = toBuffer(file.data);
            const dimensions = await readOrientedImageDimensions(source);

            if (!dimensions) {
                throw createError({
                    statusCode: 400,
                    message: 'Avatar content is not a supported raster image',
                });
            }

            assertFrameWithinImage(frame, dimensions.width, dimensions.height);

            let cropped;

            try {
                cropped = await cropSquareImage(source, frame, AVATAR_SIZE_PX, AVATAR_WEBP_QUALITY);
            } catch (error: unknown) {
                // 503 занятого семафора sharp пробрасываем со своим статусом
                if (error && typeof error === 'object' && 'statusCode' in error) {
                    throw error;
                }

                console.error('[Avatars] Failed to crop the uploaded image:', error);

                throw createError({
                    statusCode: 400,
                    message: 'Failed to process the avatar image',
                });
            }

            const publish = useBricksPublishAdapter();
            const uploaded = await publish.uploadFile({
                buffer: cropped.buffer,
                mimeType: cropped.mimeType,
                key: buildAvatarKey(publish, sessionUser.id),
            });
            const result = await useBricksAuthAdapter().updateUserProfile(
                sessionUser.id,
                { avatarUrl: uploaded.url },
                sessionUser.authVersion
            );

            // Живой учётки с этими креденшелами больше нет: её удалили,
            // деактивировали или сбросили ей пароль, пока шли sharp и заливка.
            // Записи не было ТОЧНО (условие поколения не совпало), поэтому файл
            // убирается — сослаться на него уже нечему, а ответ 401: сессия
            // мертва.
            //
            // Остальные отказы записи файл СОХРАНЯЮТ: их исход неизвестен —
            // отмену по серверному лимиту времени `withTransaction` заворачивает
            // одинаково и для UPDATE, и для COMMIT, а отменённый COMMIT мог
            // успеть записать WAL. Удаление файла по такому отказу сняло бы
            // объект из-под уже закоммиченной ссылки, то есть заменило бы
            // невидимый мусор на пустой квадрат в углу экрана
            if (!result) {
                await discardAvatarFile(publish, uploaded.url);

                throw createError({ statusCode: 401, statusMessage: 'Unauthorized' });
            }

            await discardAvatarFile(publish, result.previousAvatarUrl);

            return { user: toAuthProfileUser(result.user) };
        });
    } catch (error: unknown) {
        toHttpError(error, 'Failed to upload avatar');
    }
});
