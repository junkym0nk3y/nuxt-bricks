/**
 * Внутренние отступы поверхности:
 * - `compact` (`0.4rem`) — панель из одних иконок (плавающий тулбар картинки);
 * - `default` (`0.6rem`) — меню и списки;
 * - `roomy` (`0.8rem`) — сетки и панели с полями;
 * - `flush` (`0`) — содержимое само отвечает за отступы (список страниц с
 *   поиском и футером во всю ширину).
 */
export type TBricksPopoverDensity = 'compact' | 'default' | 'roomy' | 'flush';

/**
 * Ступень тени. `lg` — осознанный случай: поверхность всплывает над содержимым
 * канваса, а не над панелью интерфейса, и на пёстром фоне `md` теряется.
 */
export type TBricksPopoverElevation = 'sm' | 'md' | 'lg';

/**
 * Слой в стеке:
 * - `popover` — общая шкала `--bricks-z-popover`;
 * - `local` — локальный стек внутри своего родителя (поповер внутри модалки
 *   перекрывает только соседние строки, а не всё окно);
 * - `none` — стеком распоряжается вызывающий.
 *
 * Отдельным пропом, а не классом снаружи: у сырого `z-index` в вызывающем нет
 * защиты от того, что два класса-одиночки перекроют друг друга в
 * непредсказуемом порядке.
 */
export type TBricksPopoverLayer = 'popover' | 'local' | 'none';

export interface IBricksPopoverSurfaceProps {
    density?: TBricksPopoverDensity;
    elevation?: TBricksPopoverElevation;
    layer?: TBricksPopoverLayer;
}

export interface IBricksMenuItemProps {
    /** Подпись пункта — она же его доступное имя */
    label: string;
    /** Глиф слева; без него пункт остаётся выровненным по тексту */
    icon?: string;
    /** Значение справа: ширина устройства, шорткат, текущее состояние */
    hint?: string;
    /** Пункт соответствует текущему состоянию */
    active?: boolean;
    disabled?: boolean;
    /** Необратимое действие: удаление, выход */
    danger?: boolean;
}

export interface IBricksMenuItemEmits {
    click: [event: MouseEvent];
}
