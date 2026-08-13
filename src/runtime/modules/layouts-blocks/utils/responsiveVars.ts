/**
 * Общие утилиты responsive CSS-переменных и grid-позиционирования layout-блоков.
 * Используются published-рендерером и definitions блоков.
 */

// Types
import type { IBricksComponent, TBricksDeviceKey } from '../../common/types/brick';

// Constants
import {
    BASE_DEVICE_KEY,
    BASE_VAR_SUFFIX,
    DEVICE_KEY_PATTERN,
} from '../../common/constants/devices';

// Utils
import { hasOwnKey } from '../../common/utils/safeRecord';

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
 * Возвращает объект overrides для конкретного device из `props.responsive`.
 *
 * @param props - Пропсы layout-компонента.
 * @param device - Ключ устройства.
 * @returns Overrides устройства или пустой объект.
 */
export function getResponsiveOverrides(
    props: Record<string, unknown>,
    device: TBricksDeviceKey
): Record<string, unknown> {
    const rawResponsive = props?.responsive;
    if (!rawResponsive || typeof rawResponsive !== 'object') {
        return {};
    }

    const responsive = rawResponsive as Record<string, unknown>;
    const overrides = responsive[device];

    return overrides && typeof overrides === 'object' ? (overrides as Record<string, unknown>) : {};
}

/**
 * Возвращает ключи устройств, у которых в схеме блока реально есть overrides.
 *
 * Ключ базового устройства отбрасывается: его значения лежат в обычных пропах,
 * а `responsive.desktop` рендер не читает (см. `resolveBlockProps`), поэтому
 * переменная базового устройства и переменная `-base` описывали бы одно и то же.
 *
 * @param props - Пропсы layout-компонента.
 * @returns Ключи устройств с переопределениями.
 */
export function getOverriddenDeviceKeys(props: Record<string, unknown>): string[] {
    const rawResponsive = props?.responsive;
    if (!rawResponsive || typeof rawResponsive !== 'object') {
        return [];
    }

    return Object.entries(rawResponsive as Record<string, unknown>)
        .filter(
            ([key, value]) =>
                key !== BASE_DEVICE_KEY &&
                // Ключ уезжает в ИМЯ inline custom property, а схема — внешние
                // данные: legacy-файл или чужой backend могут принести что
                // угодно, и `x; color: red` дал бы поломанный style-атрибут.
                // Невалидный ключ просто не эмитится — в JSON он остаётся
                DEVICE_KEY_PATTERN.test(key) &&
                key !== BASE_VAR_SUFFIX &&
                Boolean(value) &&
                typeof value === 'object' &&
                Object.keys(value as Record<string, unknown>).length > 0
        )
        .map(([key]) => key);
}

/**
 * Создаёт CSS-переменные responsive-свойства: базовую и по одной на устройство,
 * у которого это свойство реально переопределено.
 *
 * Раньше эмитилась полная тройка mobile/tablet/desktop. С произвольным набором
 * устройств полная таблица потребовала бы протащить активный набор во все
 * definitions и оба контекста рендера (канвас и published), а один пропущенный
 * контекст дал бы расхождение билдера с опубликованной страницей. Поэтому
 * набор здесь не нужен: недостающие ступени добирает CSS — активное правило
 * читает переменную устройства с fallback'ом на `-base` (см. `responsiveCss.ts`).
 *
 * @param prefix - Префикс переменной (например, '--bricks-section-pt').
 * @param base - Базовое значение.
 * @param props - Пропсы блока целиком (нужны `props.responsive`).
 * @param key - Имя свойства в overrides.
 * @param transform - Преобразование значения в CSS-строку.
 * @returns Объект CSS-переменных.
 */
export function makeResponsiveVars(
    prefix: string,
    base: unknown,
    props: Record<string, unknown>,
    key: string,
    transform: (v: unknown) => string = String
): Record<string, string> {
    const vars: Record<string, string> = {
        [`${prefix}-${BASE_VAR_SUFFIX}`]: transform(base),
    };

    for (const device of getOverriddenDeviceKeys(props)) {
        const overrides = getResponsiveOverrides(props, device);

        if (hasOwnKey(overrides, key)) {
            vars[`${prefix}-${device}`] = transform(overrides[key]);
        }
    }

    return vars;
}

/**
 * Создаёт группу связанных CSS-переменных: базовую и по группе на каждое
 * устройство с переопределениями.
 *
 * Нужна там, где переменные производные и поодиночке несогласуемы: у Grid
 * `columns` тянет за собой `auto-flow` и обе lead-колонки, а `rowHeight`
 * с `minRowHeight` — `rows` и `auto-rows`. Если переопределить одну переменную
 * группы, а остальные оставить базовыми, получится сетка с новым числом колонок
 * и старым разбросом акцентной ячейки. Поэтому группа считается целиком от
 * пропсов, слитых с overrides устройства.
 *
 * @param prefix - Общий префикс группы (например, '--bricks-grid').
 * @param props - Пропсы блока целиком (нужны `props.responsive`).
 * @param compute - Считает значения группы по разрешённым пропсам.
 * @returns Объект CSS-переменных с суффиксами `-base` и `-<ключ устройства>`.
 */
export function makeResponsiveVarGroup(
    prefix: string,
    props: Record<string, unknown>,
    compute: (resolved: Record<string, unknown>) => Record<string, string>
): Record<string, string> {
    const vars: Record<string, string> = {};

    for (const [name, value] of Object.entries(compute(props))) {
        vars[`${prefix}-${name}-${BASE_VAR_SUFFIX}`] = value;
    }

    for (const device of getOverriddenDeviceKeys(props)) {
        const resolved = { ...props, ...getResponsiveOverrides(props, device) };

        for (const [name, value] of Object.entries(compute(resolved))) {
            vars[`${prefix}-${name}-${device}`] = value;
        }
    }

    return vars;
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
