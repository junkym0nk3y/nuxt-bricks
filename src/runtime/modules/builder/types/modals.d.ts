/**
 * Тип ключа модального окна (имя компонента)
 */
export type TModalKey = string;

/**
 * Опция для селектора модалок
 */
export interface IModalOption {
    label: string;
    value: TModalKey | null;
}
