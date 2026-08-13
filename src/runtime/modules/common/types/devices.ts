/**
 * Набор устройств: единственный источник и ширин канваса, и порогов media-query.
 *
 * `width` играет обе роли сразу — это ширина листа в билдере и `min-width`
 * диапазона на published. Отдельного списка порогов больше нет, поэтому дыр и
 * наложений между ступенями не бывает по построению: самое узкое устройство
 * обслуживает диапазон от 0, самое широкое — без верхней границы.
 */

/**
 * Запись устройства в наборе страницы.
 *
 * `key` попадает в схему (`props.responsive[key]`, `deviceVisibility[key]`) и в
 * имена CSS-переменных, поэтому после создания не меняется: пересчёт ключа при
 * переименовании подписи осиротил бы все переопределения блоков.
 */
export interface IBricksPageDevice {
    key: string;
    label: string;
    /** Ключ глифа из фиксированного набора (`DEVICE_ICON_CHOICES`). */
    icon: string;
    /** Ширина канваса (px) и `min-width` диапазона media-query. */
    width: number;
    /** Боковой padding `.bricks-container`, rem. */
    aside: number;
    maxWidth?: number;
    minWidth?: number;
}

/**
 * Устройство набора проекта: то же плюс единственная ручка, которой у страницы
 * быть не может. `remBase` — свойство проекта целиком (нестандартный
 * `html { font-size }`), и per-page его правка означала бы, что одна страница
 * живёт в другой rem-системе, чем остальные.
 */
export interface IBricksProjectDevice extends IBricksPageDevice {
    /** База rem виджета, напр. `10px` или `0.6944vw`. */
    remBase?: string;
}

/**
 * Устройство после резолва: плюс данные, которых нет ни у страницы, ни у
 * проекта. `canvasHeight` — высота листа в билдере, чистое свойство интерфейса:
 * на published у устройства высоты нет вовсе, и хранить её в схеме незачем.
 */
export interface IBricksResolvedDevice extends IBricksProjectDevice {
    canvasHeight: number;
}

export type TBricksPageDeviceSet = IBricksPageDevice[];
export type TBricksProjectDeviceSet = IBricksProjectDevice[];
export type TBricksResolvedDeviceSet = IBricksResolvedDevice[];

/**
 * Диапазон ширины окна, который обслуживает устройство.
 * У самого узкого `min` равен 0, у самого широкого `max` — `Infinity`.
 */
export interface IBricksDeviceRange {
    key: string;
    min: number;
    max: number;
}

/**
 * Запись каталога известных устройств.
 *
 * Каталог — единственная таблица, из которой берутся и дефолтный набор проекта,
 * и список выбора при добавлении, и высота листа канваса. Подписи в нём
 * английские: это данные, которые уезжают в схему страницы, а не текст
 * интерфейса, — иначе набор зависел бы от языка, выбранного в момент создания.
 */
export interface IBricksDeviceCatalogEntry {
    label: string;
    icon: string;
    width: number;
    aside: number;
    maxWidth?: number;
    /** Только UI: базовая высота листа канваса, px. */
    canvasHeight: number;
}

/**
 * Пункт выбора при добавлении устройства: запись каталога вместе со своим ключом.
 */
export interface IBricksDeviceChoice extends IBricksDeviceCatalogEntry {
    key: string;
}

/** Итог проверки набора: успех со значением либо список причин отказа. */
export type TBricksDeviceSetValidation =
    | { ok: true; value: TBricksPageDeviceSet }
    | { ok: false; errors: string[] };
