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

/**
 * Запись модалки в кеше (имя + путь к brick-файлу)
 */
export interface ICachedModal {
    name: string;
    brickPath: string;
}
