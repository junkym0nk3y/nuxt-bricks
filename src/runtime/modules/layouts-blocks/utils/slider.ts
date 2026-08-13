/**
 * Утилиты блока Slider, общие для SFC и definition.
 */

/**
 * Приводит значение `slidesPerView` к положительному числу (минимум 1).
 *
 * @param value - Значение из схемы или переопределения устройства.
 * @returns Число слайдов, не меньше единицы.
 */
export function normalizeSlidesPerView(value: unknown): number {
    return Math.max(1, Number(value) || 1);
}
