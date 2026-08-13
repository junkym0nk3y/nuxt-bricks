// #region Imports
// Types
import type {
    IBricksDeviceRange,
    IBricksPageDevice,
    IBricksProjectDevice,
    IBricksResolvedDevice,
    TBricksDeviceSetValidation,
    TBricksPageDeviceSet,
    TBricksProjectDeviceSet,
    TBricksResolvedDeviceSet,
} from '../../types/devices';

// Constants
import {
    BASE_DEVICE_KEY,
    BASE_VAR_SUFFIX,
    DEFAULT_CANVAS_HEIGHT,
    DEFAULT_REM_BASE,
    DEVICE_CATALOG,
    DEVICE_ICON_CHOICES,
    DEVICE_ICON_PREFIX,
    DEVICE_KEY_PATTERN,
    DEVICE_MAX_WIDTH,
    DEVICE_MIN_WIDTH,
    DEVICE_REM_MAX,
    DEVICE_REM_STEP,
    DEVICE_SET_MAX,
    DEVICE_SET_MIN,
    NARROW_DEVICE_KEY,
    REQUIRED_DEVICE_KEYS,
} from '../../constants/devices';
// #endregion

// #region Constants
/** Поля записи устройства, известные странице. Всё прочее — отказ. */
const PAGE_DEVICE_KEYS = new Set([
    'key',
    'label',
    'icon',
    'width',
    'aside',
    'maxWidth',
    'minWidth',
]);

/**
 * Поля устройства проекта. `remBase` есть только здесь: нестандартная rem-база —
 * свойство проекта целиком, и per-page его правка означала бы, что одна
 * страница живёт в другой rem-системе, чем соседние.
 */
const PROJECT_DEVICE_KEYS = new Set([...PAGE_DEVICE_KEYS, 'remBase']);

const ICON_CHOICES = new Set<string>(DEVICE_ICON_CHOICES);

/** Погрешность сравнения rem-значений с шагом: 0.1 + 0.2 в double даёт 0.30000000000000004. */
const REM_STEP_EPSILON = 1e-6;
// #endregion

// #region Validation
/**
 * Проверяет, что значение — целое число в границах.
 *
 * @param value - Проверяемое значение.
 * @param min - Нижняя граница включительно.
 * @param max - Верхняя граница включительно.
 * @returns true, если значение подходит.
 */
function isIntegerInRange(value: unknown, min: number, max: number): boolean {
    return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
}

/**
 * Проверяет rem-значение: неотрицательное конечное число, кратное шагу 0.2.
 *
 * @param value - Проверяемое значение.
 * @returns true, если значение подходит.
 */
function isRemValue(value: unknown): boolean {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
        return false;
    }

    if (value > DEVICE_REM_MAX) {
        return false;
    }

    const steps = value / DEVICE_REM_STEP;
    return Math.abs(steps - Math.round(steps)) < REM_STEP_EPSILON;
}

/**
 * Проверяет одну запись устройства.
 *
 * @param raw - Сырая запись.
 * @param index - Позиция в наборе (для текста ошибки).
 * @param errors - Аккумулятор причин отказа.
 * @param allowedFields - Разрешённые поля записи (страница или проект).
 * @returns Нормализованная запись либо null.
 */
// eslint-disable-next-line complexity
function validateDevice(
    raw: unknown,
    index: number,
    errors: string[],
    allowedFields: ReadonlySet<string>
): IBricksPageDevice | null {
    const at = `devices[${index}]`;

    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
        errors.push(`${at} must be an object`);
        return null;
    }

    const record = raw as Record<string, unknown>;

    for (const key of Object.keys(record)) {
        if (!allowedFields.has(key)) {
            errors.push(`${at} has unknown field "${key}"`);
            return null;
        }
    }

    if (record.remBase !== undefined && typeof record.remBase !== 'string') {
        errors.push(`${at}.remBase must be a string`);
        return null;
    }

    const { key, label, icon, width, aside, maxWidth, minWidth } = record;

    if (typeof key !== 'string' || !DEVICE_KEY_PATTERN.test(key)) {
        errors.push(`${at}.key must match ${String(DEVICE_KEY_PATTERN)}`);
        return null;
    }

    // Ключ `base` занят суффиксом базового значения responsive-переменных:
    // устройство с таким ключом затёрло бы дефолт всех блоков сразу
    if (key === BASE_VAR_SUFFIX) {
        errors.push(`${at}.key "${BASE_VAR_SUFFIX}" is reserved`);
        return null;
    }

    if (typeof label !== 'string' || label.trim().length === 0) {
        errors.push(`${at}.label is required`);
        return null;
    }

    if (typeof icon !== 'string' || !ICON_CHOICES.has(icon)) {
        errors.push(`${at}.icon must be one of the allowed device glyphs`);
        return null;
    }

    if (!isIntegerInRange(width, DEVICE_MIN_WIDTH, DEVICE_MAX_WIDTH)) {
        errors.push(`${at}.width must be an integer in [${DEVICE_MIN_WIDTH}, ${DEVICE_MAX_WIDTH}]`);
        return null;
    }

    if (!isRemValue(aside)) {
        errors.push(`${at}.aside must be a non-negative rem value with step ${DEVICE_REM_STEP}`);
        return null;
    }

    if (maxWidth !== undefined && !isRemValue(maxWidth)) {
        errors.push(`${at}.maxWidth must be a non-negative rem value with step ${DEVICE_REM_STEP}`);
        return null;
    }

    if (minWidth !== undefined && !isRemValue(minWidth)) {
        errors.push(`${at}.minWidth must be a non-negative rem value with step ${DEVICE_REM_STEP}`);
        return null;
    }

    return {
        key,
        label: label.trim(),
        icon,
        width: width as number,
        aside: aside as number,
        ...(maxWidth === undefined ? {} : { maxWidth: maxWidth as number }),
        ...(minWidth === undefined ? {} : { minWidth: minWidth as number }),
    };
}

/**
 * Проверяет структуру набора целиком: длину, уникальность, порядок и крайних.
 *
 * @param devices - Уже проверенные поштучно записи.
 * @param errors - Аккумулятор причин отказа.
 */
function validateSetShape(devices: TBricksPageDeviceSet, errors: string[]): void {
    const keys = new Set<string>();
    const widths = new Set<number>();

    for (const device of devices) {
        if (keys.has(device.key)) {
            errors.push(`duplicate device key "${device.key}"`);
        }
        if (widths.has(device.width)) {
            errors.push(`duplicate device width ${device.width}`);
        }
        keys.add(device.key);
        widths.add(device.width);
    }

    // Строгая монотонность, а не «отсортируем сами»: диапазон устройства
    // считается как `следующая.width - 1`, и на неотсортированном массиве это
    // дало бы пересекающийся или отрицательный диапазон
    for (let i = 1; i < devices.length; i += 1) {
        if (devices[i].width <= devices[i - 1].width) {
            errors.push('devices must be sorted by ascending width');
            break;
        }
    }

    for (const required of REQUIRED_DEVICE_KEYS) {
        if (!keys.has(required)) {
            errors.push(`device "${required}" is required`);
        }
    }

    if (devices.length > 0) {
        if (devices[0].key !== NARROW_DEVICE_KEY) {
            errors.push(`device "${NARROW_DEVICE_KEY}" must be the narrowest`);
        }
        if (devices[devices.length - 1].key !== BASE_DEVICE_KEY) {
            errors.push(`device "${BASE_DEVICE_KEY}" must be the widest`);
        }
    }
}

/**
 * Проверяет набор устройств страницы.
 *
 * Ничего не чинит намеренно: повреждённый набор, приведённый сортировкой и
 * обрезкой к «валидному», получил бы новую семантику молча — мог потерять
 * обязательное устройство или сдвинуть диапазоны. Отказ виден, тихая подмена — нет.
 *
 * @param input - Сырое значение (тело запроса, строка БД, импортированный файл).
 * @param scope - Чей это набор: у проекта дополнительно разрешён `remBase`.
 * @returns Успех с нормализованным набором либо список причин отказа.
 */
export function validateDeviceSet(
    input: unknown,
    scope: 'page' | 'project' = 'page'
): TBricksDeviceSetValidation {
    const errors: string[] = [];
    const allowedFields = scope === 'project' ? PROJECT_DEVICE_KEYS : PAGE_DEVICE_KEYS;

    if (!Array.isArray(input)) {
        return { ok: false, errors: ['viewportConfig must be an array'] };
    }

    if (input.length < DEVICE_SET_MIN || input.length > DEVICE_SET_MAX) {
        return {
            ok: false,
            errors: [`viewportConfig must contain ${DEVICE_SET_MIN}..${DEVICE_SET_MAX} devices`],
        };
    }

    const devices: TBricksPageDeviceSet = [];

    input.forEach((raw, index) => {
        const device = validateDevice(raw, index, errors, allowedFields);
        if (device) {
            devices.push(device);
        }
    });

    if (errors.length > 0) {
        return { ok: false, errors };
    }

    validateSetShape(devices, errors);

    return errors.length > 0 ? { ok: false, errors } : { ok: true, value: devices };
}
// #endregion

// #region Resolve
/**
 * Достраивает запись страницы до резолвнутой: `remBase` берётся у одноимённого
 * устройства проекта (свойство проекта, страница его не задаёт), высота листа —
 * у канонического ключа.
 *
 * @param device - Запись набора страницы.
 * @param projectByKey - Устройства проекта по ключу.
 * @returns Резолвнутая запись.
 */
function toResolvedDevice(
    device: IBricksPageDevice,
    projectByKey: Map<string, IBricksProjectDevice>
): IBricksResolvedDevice {
    const project = projectByKey.get(device.key);

    return {
        ...device,
        remBase: project?.remBase ?? DEFAULT_REM_BASE,
        canvasHeight: DEVICE_CATALOG[device.key]?.canvasHeight ?? DEFAULT_CANVAS_HEIGHT,
    };
}

/**
 * Резолвит набор устройств для страницы.
 *
 * `null` — страница наследует набор проекта. Повреждённый набор заменяется
 * набором проекта целиком: на публичном пути лучше показать страницу в
 * проектной раскладке, чем уронить её, — но факт подмены не замалчивается,
 * вызывающий получает его в `usedFallback`.
 *
 * @param pageConfig - Набор страницы или `null`.
 * @param projectDevices - Резолвнутый набор проекта.
 * @returns Резолвнутый набор и признак срабатывания fallback.
 */
export function resolveDeviceSet(
    pageConfig: unknown,
    projectDevices: TBricksProjectDeviceSet
): { devices: TBricksResolvedDeviceSet; usedFallback: boolean } {
    const projectByKey = new Map(projectDevices.map((device) => [device.key, device]));
    const resolveProject = (): TBricksResolvedDeviceSet =>
        projectDevices.map((device) => toResolvedDevice(device, projectByKey));

    if (pageConfig === null || pageConfig === undefined) {
        return { devices: resolveProject(), usedFallback: false };
    }

    const validation = validateDeviceSet(pageConfig);

    if (!validation.ok) {
        return { devices: resolveProject(), usedFallback: true };
    }

    return {
        devices: validation.value.map((device) => toResolvedDevice(device, projectByKey)),
        usedFallback: false,
    };
}
// #endregion

// #region Icons
/**
 * Переводит короткий ключ глифа устройства в ключ реестра иконок.
 *
 * В схеме хранится короткий ключ (`device-laptop`), а не имя из icon-пакета:
 * набор уезжает в данные страницы, и привязывать их к конкретному пакету иконок
 * незачем. Имя отличается от ключа только префиксом, поэтому таблицы
 * соответствий нет. Неизвестный ключ отдаёт глиф десктопа, а не пустоту —
 * иконка устройства всплывает в баре, табах и флайауте, и «иконка не найдена»
 * там заметнее, чем неточный глиф.
 *
 * @param icon - Короткий ключ глифа из записи устройства.
 * @returns Ключ реестра иконок.
 */
export function resolveDeviceIcon(icon: string): string {
    const known = ICON_CHOICES.has(icon) ? icon : DEVICE_CATALOG[BASE_DEVICE_KEY].icon;

    return `${DEVICE_ICON_PREFIX}${known}`;
}
// #endregion

// #region Ranges
/**
 * Считает диапазоны ширины окна по набору.
 *
 * Самое узкое устройство обслуживает диапазон от 0, самое широкое — без верхней
 * границы, промежуточные — до ширины следующего минус пиксель. Поэтому дыр и
 * наложений не бывает по построению, и отдельного списка порогов не нужно.
 *
 * @param devices - Набор, отсортированный по возрастанию ширины.
 * @returns Диапазоны в том же порядке.
 */
export function deviceRanges(devices: ReadonlyArray<IBricksPageDevice>): IBricksDeviceRange[] {
    return devices.map((device, index) => ({
        key: device.key,
        min: index === 0 ? 0 : device.width,
        max: index === devices.length - 1 ? Number.POSITIVE_INFINITY : devices[index + 1].width - 1,
    }));
}
// #endregion
