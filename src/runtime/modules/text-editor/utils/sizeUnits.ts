/**
 * Чистые конверсии размеров медиа-нодов TipTap (px/rem/em/%).
 * px-эквивалент 1em зависит от computed font-size элемента — передаётся параметром.
 */

export const SIZE_UNITS = ['px', 'rem', 'em', '%'] as const;

export type TSizeUnit = (typeof SIZE_UNITS)[number];

export const PX_PER_REM = 10;
export const DEFAULT_PX_PER_EM = 16;

/**
 * Парсит строку вида "10rem" в число и единицу.
 */
export function parseCustomDimension(value: string): { value: number; unit: TSizeUnit } | null {
    const match = value.match(/^(\d+(?:\.\d+)?)(rem|em|%|px)$/);
    if (!match) {
        return null;
    }
    return { value: parseFloat(match[1]), unit: match[2] as TSizeUnit };
}

/**
 * Конвертирует значение в пиксели для ResizableNodeView.
 * Для px/% возвращает 0 — пиксельный эквивалент для них не вычисляется.
 */
export function convertToPx(value: number, unit: TSizeUnit, emPixelSize: number): number {
    switch (unit) {
        case 'rem':
            return Math.round(value * PX_PER_REM);
        case 'em':
            return Math.round(value * emPixelSize);
        default:
            return 0;
    }
}

/**
 * Конвертирует значение из пикселей в заданную единицу.
 */
export function convertFromPx(px: number, unit: TSizeUnit, emPixelSize: number): number {
    switch (unit) {
        case 'rem':
            return px / PX_PER_REM;
        case 'em':
            return px / emPixelSize;
        default:
            return px;
    }
}

/**
 * Округляет число до заданного количества знаков после запятой.
 */
export function roundDecimal(value: number, decimals: number): number {
    const factor = 10 ** decimals;
    return Math.round(value * factor) / factor;
}
