import type { TBrickManifestRef } from '../../../common/types/brickManifest';

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
 * Запись модалки в кеше: имя и путь к brick-файлу из манифеста
 * brick-компонентов, категория в кеше не нужна (там всегда `Modal`)
 */
export type TCachedModal = TBrickManifestRef;
