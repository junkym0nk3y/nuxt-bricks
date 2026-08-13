/**
 * Единственный источник знания о наборе устройств.
 *
 * Прежде набор жил тремя независимыми копиями и они расходились: ключи схемы
 * были литеральным типом из трёх, ширины канваса — в `bricks.breakpoints`
 * app.config, а пороги media-query — отдельным списком `device.breakpoints`,
 * который с ширинами не был связан вовсе. Из-за этого объявленная в порогах
 * ступень `laptop: 1024` в генерацию CSS не попадала, и окно 1280 получало
 * планшетную раскладку, хотя в билдере тот же экран показывался десктопным.
 *
 * Теперь ширина устройства — это и лист билдера, и `min-width` его диапазона.
 * Перекрыть дефолт можно build-time опцией модуля `bricks.devices`; она же
 * кормит SCSS-карту миксинов, поэтому числа у рантайма и у авторов бриков одни.
 */

// Types
import type {
    IBricksDeviceCatalogEntry,
    IBricksDeviceChoice,
    TBricksProjectDeviceSet,
} from '../types/devices';

/** Ключ базового устройства: его пропсы лежат в схеме без обёртки `responsive`. */
export const BASE_DEVICE_KEY = 'desktop';

/** Ключ самого узкого устройства. */
export const NARROW_DEVICE_KEY = 'mobile';

/**
 * Крайние устройства обязательны и неудаляемы, а промежуточные обязаны
 * помещаться строго между ними. Из этих двух правил следует, что `mobile`
 * всегда первый, а `desktop` — последний; на этом инварианте держится то, что
 * база переопределений и канонический для SEO device остаются фиксированными
 * ключами, а не «самым широким устройством из набора».
 */
export const REQUIRED_DEVICE_KEYS = [NARROW_DEVICE_KEY, BASE_DEVICE_KEY] as const;

export const DEVICE_SET_MIN = 2;
export const DEVICE_SET_MAX = 4;

/**
 * Ниже 320 не рассчитан ни один блок — такую ширину редактор не принимает.
 * Верхняя граница — 8K: не столько реальный экран, сколько потолок, за которым
 * значение заведомо мусорное.
 */
export const DEVICE_MIN_WIDTH = 320;
export const DEVICE_MAX_WIDTH = 7680;

export const DEVICE_KEY_PATTERN = /^[a-z][a-z0-9-]{0,62}$/;

/**
 * Суффикс базового значения responsive-переменных (`--bricks-grid-columns-base`).
 * Ключ `base` поэтому занят: устройство с таким ключом затёрло бы значение по
 * умолчанию всех блоков сразу.
 */
export const BASE_VAR_SUFFIX = 'base';

/** Шаг rem-полей: правило кратности 0.2 действует и на вводимые значения. */
export const DEVICE_REM_STEP = 0.2;

/** Потолок rem-полей — заведомо больше любого осмысленного отступа и max-width. */
export const DEVICE_REM_MAX = 1000;

/** Высота листа канваса, если устройства нет в каталоге. */
export const DEFAULT_CANVAS_HEIGHT = 1080;

/** База rem библиотеки: билдер форсирует `html { font-size: 10px }`. */
export const DEFAULT_REM_BASE = '10px';

/**
 * Каталог устройств — одна таблица на всё: дефолтный набор проекта, выбор при
 * добавлении строки и высота листа канваса.
 *
 * Ровно четыре записи, и это не заготовка «на будущее»: устройство добавляется
 * выбором из этого списка, а не свободным вводом, поэтому каждая лишняя строка
 * здесь — лишний пункт в меню. Ключ уезжает в схему (`props.responsive[key]`) и
 * в имена CSS-переменных, подпись правится пользователем в строке таблицы.
 */
export const DEVICE_CATALOG: Record<string, IBricksDeviceCatalogEntry> = {
    mobile: { label: 'Mobile', icon: 'device-mobile', width: 375, aside: 0.4, canvasHeight: 812 },
    tablet: { label: 'Tablet', icon: 'device-tablet', width: 768, aside: 0.8, canvasHeight: 1024 },
    laptop: { label: 'Laptop', icon: 'device-laptop', width: 1280, aside: 1.2, canvasHeight: 800 },
    desktop: {
        label: 'Desktop',
        icon: 'device-desktop',
        width: 1600,
        aside: 2,
        maxWidth: 192,
        canvasHeight: 1080,
    },
};

/**
 * Глифы выбора иконки — по одному на устройство каталога.
 *
 * Короткий ключ, а не имя из icon-пакета: набор уезжает в схему страницы, и
 * привязывать её к конкретному пакету иконок незачем. Полное имя строится
 * префиксом (см. `resolveDeviceIcon`), поэтому второй таблицы соответствий нет.
 */
export const DEVICE_ICON_CHOICES: string[] = Object.values(DEVICE_CATALOG).map(
    (entry) => entry.icon
);

/** Префикс реестра иконок: короткий ключ глифа отличается от имени только им. */
export const DEVICE_ICON_PREFIX = 'ta:outline-';

/**
 * Собирает запись набора из каталога: `canvasHeight` в наборе не хранится — это
 * свойство интерфейса, а не раскладки страницы.
 *
 * @param key - Ключ устройства каталога.
 * @returns Запись набора устройств.
 */
function toPageDevice(key: string): TBricksProjectDeviceSet[number] {
    const { canvasHeight: _canvasHeight, ...device } = DEVICE_CATALOG[key];

    return { key, ...device };
}

/**
 * Дефолтный набор проекта. Ровно те три устройства, что были зашиты в код, —
 * добавление сюда четвёртой ступени изменило бы published-раскладку всех
 * существующих страниц молча. Ноутбук страница добавляет себе сама.
 */
export const DEFAULT_BRICKS_DEVICES: TBricksProjectDeviceSet = [
    NARROW_DEVICE_KEY,
    'tablet',
    BASE_DEVICE_KEY,
].map(toPageDevice);

/**
 * Записи каталога, которые можно добавить строкой: крайние устройства
 * обязательны и уже стоят в наборе, поэтому в выборе им места нет.
 */
export const DEVICE_CHOICES: IBricksDeviceChoice[] = Object.entries(DEVICE_CATALOG)
    .filter(([key]) => !(REQUIRED_DEVICE_KEYS as ReadonlyArray<string>).includes(key))
    .map(([key, entry]) => ({ key, ...entry }));
