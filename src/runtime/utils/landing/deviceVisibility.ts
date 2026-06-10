import type { IDeviceVisibilityConfig } from '../../types/landing';

export const DEFAULT_DEVICE_VISIBILITY: IDeviceVisibilityConfig = {
    mobile: true,
    tablet: true,
    desktop: true,
};

/**
 * Нормализует конфигурацию видимости по устройствам и заполняет отсутствующие ключи значениями по умолчанию.
 *
 * @param value - Частичная конфигурация видимости.
 */
export function normalizeDeviceVisibility(
    value: Partial<IDeviceVisibilityConfig> | null | undefined
): IDeviceVisibilityConfig {
    return {
        ...DEFAULT_DEVICE_VISIBILITY,
        ...(value ?? {}),
        mobile: value?.mobile !== undefined ? Boolean(value.mobile) : true,
        tablet: value?.tablet !== undefined ? Boolean(value.tablet) : true,
        desktop: value?.desktop !== undefined ? Boolean(value.desktop) : true,
    };
}

/**
 * Возвращает список CSS-классов для скрытия компонента на заданных устройствах.
 *
 * @param value - Конфигурация видимости по устройствам.
 */
export function buildDeviceVisibilityClasses(
    value: Partial<IDeviceVisibilityConfig> | null | undefined
): string[] {
    const normalized = normalizeDeviceVisibility(value);

    const classes: string[] = [];

    if (!normalized.mobile) {
        classes.push('bricks-hide--mobile');
    }
    if (!normalized.tablet) {
        classes.push('bricks-hide--tablet');
    }
    if (!normalized.desktop) {
        classes.push('bricks-hide--desktop');
    }

    return classes;
}

/**
 * Определяет, нужно ли пометить компонент как `aria-hidden="true"`.
 * Desktop считается канонической версией для SEO — компоненты, скрытые на desktop, помечаются как дубли.
 *
 * @param value - Конфигурация видимости по устройствам.
 */
export function shouldAriaHideComponent(
    value: Partial<IDeviceVisibilityConfig> | null | undefined
): boolean {
    const normalized = normalizeDeviceVisibility(value);
    return !normalized.desktop;
}
