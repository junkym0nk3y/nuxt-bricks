/**
 * Дефолты и границы оптимизации медиа — один источник на клиент и сервер.
 *
 * Прежде эти числа жили тремя копиями: в серверном `imageProcessing.ts`, в
 * клиентском `useMediaUpload.ts` и литералом в модалке галереи. Расхождение
 * было бы невидимым и однонаправленным: поповер продолжал бы показывать старое
 * значение И отправлять его в multipart-форме, то есть новый серверный дефолт
 * для загрузок из галереи просто не заработал бы. То же с лимитами размера —
 * клиент отбивал бы файл своим прежним потолком, не доводя запрос до сервера.
 */

// Types
import type { IBricksMediaOptimization, IMediaMaxWidthBounds } from '../types/media';

/** Потолок размера изображения по умолчанию (МБ). */
export const DEFAULT_MEDIA_MAX_UPLOAD_SIZE_MB = 10;

/** Потолок размера видео по умолчанию (МБ) — видео не оптимизируется. */
export const DEFAULT_MEDIA_MAX_VIDEO_UPLOAD_SIZE_MB = 100;

/** Параметры оптимизации по умолчанию; переопределяются `bricks.media.optimization`. */
export const DEFAULT_MEDIA_OPTIMIZATION: IBricksMediaOptimization = {
    format: 'webp',
    quality: 70,
    maxWidth: 1920,
};

/**
 * Границы поля ввода параметров — и, следовательно, границы запроса.
 *
 * Общие с сервером, а не «клиентские»: поле поповера ограничивает ввод, а ручка
 * загрузки — запрос мимо интерфейса. Пока границы жили только в компоненте,
 * `maxWidth: 1` из crafted-запроса проходил, и «полный» файл сохранялся шириной
 * в один пиксель.
 *
 * Качество режется всегда, включая конфиг: вне 1..100 падает сам кодировщик.
 * Ширина — нет, см. `resolveMediaMaxWidthBounds`.
 */
export const MEDIA_QUALITY_MIN = 1;
export const MEDIA_QUALITY_MAX = 100;
export const MEDIA_MAX_WIDTH_MIN = 16;
export const MEDIA_MAX_WIDTH_MAX = 8000;

/**
 * Приводит `bricks.media.optimization.maxWidth` к пригодной ширине в пикселях.
 *
 * Единственная нормализация конфигурационной ширины на клиент и сервер: обе
 * стороны считают от неё границы поля, и стоило им нормализовать значение
 * по-разному, как они разъезжались — клиент отдавал `min: 0`, сервер `min: 16`.
 *
 * Значение меньше пикселя — не ширина, а опечатка, и уходит в дефолт: округление
 * дало бы ноль, а `sharp` принимает только положительное целое, то есть загрузка
 * падала бы на каждом файле. Малые, но осмысленные значения при этом сохраняются:
 * `8` остаётся восьмёркой, потолок поля ввода конфигу не указ.
 *
 * @param value - Сырое значение из конфига модуля.
 * @returns Положительная целая ширина.
 */
export function resolveConfiguredMaxWidth(value: unknown): number {
    const parsed = Number(value);

    if (!Number.isFinite(parsed) || parsed < 1) {
        return DEFAULT_MEDIA_OPTIMIZATION.maxWidth;
    }

    return Math.round(parsed);
}

/**
 * Считает действующие границы «максимальной ширины» от значения из конфига.
 *
 * Конфиг ставит разработчик, и резать его осознанный выбор потолком,
 * придуманным для поля ввода, нечем: значение оттуда границы не сужает, а
 * раздвигает — в обе стороны, иначе `maxWidth: 8` из конфига превращалось бы в
 * 16 при том, что 12000 сохранялось бы как есть.
 *
 * Формула общая у клиента и сервера намеренно. Пока потолок был константой,
 * `maxWidth: 12000` из конфига жил ровно до первой загрузки: поповер показывал
 * 12000 и отправлял его в форме, поле схлопывало значение до 8000 на blur, а
 * ручка — на каждой загрузке, то есть настройка не работала вообще.
 *
 * @param configuredMaxWidth - Значение `bricks.media.optimization.maxWidth`.
 * @returns Границы для поля ввода и для проверки запроса.
 */
export function resolveMediaMaxWidthBounds(configuredMaxWidth: number): IMediaMaxWidthBounds {
    const configured = resolveConfiguredMaxWidth(configuredMaxWidth);

    return {
        min: Math.min(MEDIA_MAX_WIDTH_MIN, configured),
        max: Math.max(MEDIA_MAX_WIDTH_MAX, configured),
    };
}
