/**
 * Общие утилиты responsive CSS-переменных и grid-позиционирования layout-блоков.
 * Вынесены из render/composables/useRendererLayouts.ts (шаг B1) — используются
 * published-рендерером и definitions блоков (Часть B).
 */

// Types
import type { IBricksComponent, TBricksDeviceKey } from '../../common/types/brick';

/**
 * Округляет значение в rem до 1 десятичного знака.
 *
 * @param v - Произвольное значение (число в rem).
 * @returns CSS-значение в rem (минимум 0).
 */
export function toRem(v: unknown): string {
    return `${Math.round(Math.max(0, Number(v) || 0) * 10) / 10}rem`;
}

/**
 * Resolve значения с учётом device-override.
 *
 * @param base - Базовое (desktop) значение.
 * @param overrides - Объект overrides конкретного device.
 * @param key - Имя свойства.
 * @returns Override, если он задан, иначе базовое значение.
 */
export function resolveResponsiveValue<T>(base: T, overrides: Record<string, any>, key: string): T {
    return key in overrides ? (overrides[key] as T) : base;
}

/**
 * Создаёт тройку CSS-переменных (desktop/tablet/mobile) для responsive свойства.
 *
 * @param prefix - Префикс переменной (например, '--bricks-section-pt').
 * @param base - Базовое (desktop) значение.
 * @param tabletOv - Overrides для tablet.
 * @param mobileOv - Overrides для mobile.
 * @param key - Имя свойства в overrides.
 * @param transform - Преобразование значения в CSS-строку.
 * @returns Объект с тремя CSS-переменными.
 */
export function makeResponsiveVars(
    prefix: string,
    base: unknown,
    tabletOv: Record<string, any>,
    mobileOv: Record<string, any>,
    key: string,
    transform: (v: unknown) => string = String
): Record<string, string> {
    return {
        [`${prefix}-desktop`]: transform(base),
        [`${prefix}-tablet`]: transform(resolveResponsiveValue(base, tabletOv, key)),
        [`${prefix}-mobile`]: transform(resolveResponsiveValue(base, mobileOv, key)),
    };
}

/**
 * Возвращает объект overrides для конкретного device из `props.responsive`.
 *
 * @param props - Пропсы layout-компонента.
 * @param device - Ключ устройства.
 * @returns Overrides устройства или пустой объект.
 */
export function getResponsiveOverrides(
    props: Record<string, any>,
    device: TBricksDeviceKey
): Record<string, any> {
    const rawResponsive = props?.responsive;
    if (!rawResponsive || typeof rawResponsive !== 'object') {
        return {};
    }

    const responsive = rawResponsive as Record<string, unknown>;
    const overrides = responsive[device];

    return overrides && typeof overrides === 'object' ? (overrides as Record<string, any>) : {};
}

/**
 * Возвращает inline-стили grid-позиционирования компонента внутри родительского Grid.
 *
 * @param component - Компонент схемы.
 * @returns Объект с gridColumn/gridRow (только заданные).
 */
export function gridPlacementStyle(component: IBricksComponent): Record<string, string> {
    const style: Record<string, string> = {};

    if (component.gridColumn) {
        style.gridColumn = component.gridColumn;
    }
    if (component.gridRow) {
        style.gridRow = component.gridRow;
    }

    return style;
}
