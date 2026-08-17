/**
 * Медиа-настройки загрузки: лимиты размера и параметры оптимизации — из app
 * config и из полей multipart-формы, которые их переопределяют на одну загрузку.
 *
 * Отдельно от `imageProcessing.ts` не только ради размера файла: там — работа с
 * пикселями (sharp, семафор, сигнатуры), здесь — чтение конфигурации и границы
 * НЕДОВЕРЕННОГО ввода. Разные причины меняться и разные зависимости: этому модулю
 * нужен `useAppConfig`, тому — sharp.
 */
import type { IMediaOptimizationRequestFields, IResolvedMediaConfig } from '../../types/media';
import { useAppConfig } from 'nitropack/runtime';
import type { IBricksMediaOptimization } from '../../../common/types/media';
import type { TBricksMediaImageFormat } from '../../../common/types/config';
import {
    DEFAULT_MEDIA_MAX_UPLOAD_SIZE_MB,
    DEFAULT_MEDIA_MAX_VIDEO_UPLOAD_SIZE_MB,
    DEFAULT_MEDIA_OPTIMIZATION,
    MEDIA_QUALITY_MAX,
    MEDIA_QUALITY_MIN,
    resolveConfiguredMaxWidth,
    resolveMediaMaxWidthBounds,
} from '../../../common/constants/mediaOptimization';

// #region Data
const BYTES_IN_MB = 1024 * 1024;
// #endregion

// #region Helpers
/**
 * Приводит значение к положительному числу, иначе возвращает запасное.
 * @param value Сырое значение.
 * @param fallback Значение по умолчанию.
 */
function resolveNumber(value: unknown, fallback: number): number {
    const numericValue = Number(value);

    if (Number.isFinite(numericValue) && numericValue > 0) {
        return numericValue;
    }

    return fallback;
}

/**
 * Приводит значение к известному формату; неизвестное — к дефолту конфига.
 *
 * @param value Сырое значение (конфиг или поле multipart-формы).
 * @param fallback Значение по умолчанию.
 */
export function resolveImageFormat(
    value: unknown,
    fallback: TBricksMediaImageFormat
): TBricksMediaImageFormat {
    if (value === 'webp' || value === 'original') {
        return value;
    }

    return fallback;
}

/**
 * Приводит качество к тому, что принимает кодировщик.
 *
 * Применяется всегда, включая конфиг: sharp падает на значении вне 1..100, и
 * опечатка в `bricks.media.optimization.quality` роняла бы любую загрузку вместо
 * того, чтобы дать разумный результат.
 *
 * @param quality Сырое качество.
 */
function clampQuality(quality: number): number {
    return Math.min(Math.max(Math.round(quality), MEDIA_QUALITY_MIN), MEDIA_QUALITY_MAX);
}

/**
 * Приводит сырое поле формы к положительному числу.
 *
 * @param value Значение поля или undefined, если поля не было.
 * @returns Число либо null — переопределения не было.
 */
function toRequestedNumber(value: string | undefined): number | null {
    if (typeof value !== 'string' || value.trim() === '') {
        return null;
    }

    const parsed = Number(value);

    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}
// #endregion

/**
 * Разбирает НЕДОВЕРЕННЫЕ поля формы и накрывает ими дефолты конфига.
 *
 * Границы применяются только к тому, что действительно пришло с формой: поле
 * поповера ограничивает ввод, а запрос мимо интерфейса им не ограничен —
 * `maxWidth: 1` сохранял бы «полный» файл шириной в один пиксель. Значение из
 * конфига, взятое при отсутствующем поле, границами не режется: пока эта
 * функция принимала уже склеенный объект, отличить одно от другого было
 * нечем, и `maxWidth: 12000` из конфига молча становился 8000.
 *
 * Потолок и пол самого запроса тоже считаются от конфига
 * (`resolveMediaMaxWidthBounds`): значение, которое разработчик выбрал дефолтом,
 * не может быть недостижимо для запроса — интерфейс отправляет его дословно.
 *
 * @param requested Сырые поля multipart-формы.
 * @param fallback Параметры из конфига (уже разрешённые).
 * @returns Эффективные параметры оптимизации.
 */
export function resolveRequestedOptimization(
    requested: IMediaOptimizationRequestFields,
    fallback: IBricksMediaOptimization
): IBricksMediaOptimization {
    const requestedQuality = toRequestedNumber(requested.quality);
    const requestedMaxWidth = toRequestedNumber(requested.maxWidth);
    const maxWidthBounds = resolveMediaMaxWidthBounds(fallback.maxWidth);

    return {
        format: resolveImageFormat(requested.format, fallback.format),
        quality: requestedQuality === null ? fallback.quality : clampQuality(requestedQuality),
        maxWidth:
            requestedMaxWidth === null
                ? fallback.maxWidth
                : Math.min(
                      Math.max(Math.round(requestedMaxWidth), maxWidthBounds.min),
                      maxWidthBounds.max
                  ),
    };
}

/**
 * Читает медиа-настройки (лимит и параметры оптимизации) из app config с дефолтами.
 */
export function resolveMediaConfig(): IResolvedMediaConfig {
    const appConfig = useAppConfig();
    const mediaConfig = appConfig.bricks?.media ?? {};
    const optimization = mediaConfig.optimization ?? {};
    const maxUploadSizeMb = resolveNumber(
        mediaConfig.maxUploadSizeMb,
        DEFAULT_MEDIA_MAX_UPLOAD_SIZE_MB
    );
    const maxVideoUploadSizeMb = resolveNumber(
        mediaConfig.maxVideoUploadSizeMb,
        DEFAULT_MEDIA_MAX_VIDEO_UPLOAD_SIZE_MB
    );

    return {
        maxUploadSizeBytes: maxUploadSizeMb * BYTES_IN_MB,
        maxUploadSizeMb,
        maxVideoUploadSizeBytes: maxVideoUploadSizeMb * BYTES_IN_MB,
        maxVideoUploadSizeMb,
        optimization: {
            format: resolveImageFormat(optimization.format, DEFAULT_MEDIA_OPTIMIZATION.format),
            quality: clampQuality(
                resolveNumber(optimization.quality, DEFAULT_MEDIA_OPTIMIZATION.quality)
            ),
            // Нормализация здесь, а не при разборе запроса: границам запроса это
            // значение больше не подчиняется, а sharp принимает ширину только
            // положительным целым — дробный `maxWidth` из конфига ронял бы загрузку
            maxWidth: resolveConfiguredMaxWidth(optimization.maxWidth),
        },
    };
}
