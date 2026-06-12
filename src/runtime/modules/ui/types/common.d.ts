/**
 * Общие типы UI-кита (используются в base/ и inputs/).
 */

export interface IBrickUiCommonProp {
    label: string;
    value: string | boolean;
    disabled?: boolean;
    placeholder?: string;
}
