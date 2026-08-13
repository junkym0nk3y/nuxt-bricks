import type { IDeviceVisibilityConfig } from '../../types/brick';
import { BASE_DEVICE_KEY, DEVICE_KEY_PATTERN } from '../../constants/devices';

/**
 * Нормализует конфигурацию видимости по устройствам.
 *
 * Отсутствие ключа означает «видно», поэтому нормализация только приводит уже
 * существующие значения к булеву и отбрасывает мусор. Дописывать недостающие
 * ключи со значением `true` нельзя: набор устройств у страниц разный, и такая
 * нормализация возвращала бы в схему ключи только что удалённых устройств при
 * каждой десериализации — тихо копя данные о несуществующих ступенях.
 *
 * @param value - Частичная конфигурация видимости.
 * @returns Конфигурация только из явно заданных флагов.
 */
export function normalizeDeviceVisibility(
    value: Partial<IDeviceVisibilityConfig> | null | undefined
): IDeviceVisibilityConfig {
    if (!value || typeof value !== 'object') {
        return {};
    }

    // Значения приводятся к булеву, а не отбрасываются по типу: схема — внешние
    // данные, и `0` в ней означает «скрыто», а не «поле не задано»
    return Object.fromEntries(
        Object.entries(value)
            .filter(([, flag]) => flag !== undefined && flag !== null)
            .map(([key, flag]) => [key, Boolean(flag)])
    );
}

/**
 * Возвращает список CSS-классов для скрытия компонента на заданных устройствах.
 *
 * Набор устройств здесь не нужен: классы строятся только по явным `false`, а
 * какие ключи активны — решает генерируемый CSS (правила есть только для
 * устройств набора страницы, поэтому осиротевший класс ни на что не влияет).
 *
 * Ключ проверяется контрактом имени: он уезжает в ИМЯ класса, а схема — внешние
 * данные. Ключ `x bricks-hide--desktop` дал бы элементу два класса, второй из
 * которых — настоящее правило скрытия, то есть чужая строка в БД или
 * импортированный файл могли бы навязать элементу произвольный глобальный класс.
 * Осиротевший, но синтаксически валидный ключ (`laptop` вне набора) сохраняется —
 * фильтруется мусор, а не отсутствие ключа в наборе.
 *
 * @param value - Конфигурация видимости по устройствам.
 * @returns Классы вида `bricks-hide--<ключ устройства>`.
 */
export function buildDeviceVisibilityClasses(
    value: Partial<IDeviceVisibilityConfig> | null | undefined
): string[] {
    return Object.entries(normalizeDeviceVisibility(value))
        .filter(([key, isVisible]) => !isVisible && DEVICE_KEY_PATTERN.test(key))
        .map(([key]) => `bricks-hide--${key}`);
}

/**
 * Определяет, нужно ли пометить компонент как `aria-hidden="true"`.
 *
 * Базовое устройство считается канонической версией для SEO — компоненты,
 * скрытые на нём, помечаются как дубли.
 *
 * @param value - Конфигурация видимости по устройствам.
 * @returns true — компонент скрыт на базовом устройстве.
 */
export function shouldAriaHideComponent(
    value: Partial<IDeviceVisibilityConfig> | null | undefined
): boolean {
    return normalizeDeviceVisibility(value)[BASE_DEVICE_KEY] === false;
}
