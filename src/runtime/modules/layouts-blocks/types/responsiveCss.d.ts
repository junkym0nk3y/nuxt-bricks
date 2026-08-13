/**
 * Типы генератора responsive CSS layout-блоков.
 */

/** Блок с `responsiveCssVars`: селектор + конфиг переменных из definition. */
export interface IResponsiveCssBlock {
    selector: string;
    prefix: string;
    vars: string[];
}
