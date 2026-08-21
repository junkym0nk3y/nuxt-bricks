/**
 * Types of the responsive CSS generator of the layout blocks.
 */

/** A block with `responsiveCssVars`: selector plus the variable config from the definition */
export interface IResponsiveCssBlock {
    selector: string;
    prefix: string;
    vars: string[];
}
