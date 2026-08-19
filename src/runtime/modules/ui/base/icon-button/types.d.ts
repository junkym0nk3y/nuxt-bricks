/**
 * Поверхность, на которой стоит кнопка: от неё зависят рамка, фон и цвет глифа.
 *
 * `outlined` — рамка на светлом фоне (строки списков, карточки, инструменты
 * редактора); `ghost` — без рамки, в плотной панели, где рамки соседей уже
 * рисуют сетку; `overlay` — белый глиф поверх тёмной вуали на миниатюре.
 */
export type TBricksIconButtonVariant = 'outlined' | 'ghost' | 'overlay';

export type TBricksIconButtonSize = 'md' | 'lg';

export type TBricksIconButtonTooltipSide = 'top' | 'bottom' | 'left' | 'right';

export interface IBricksIconButtonProps {
    /** Ключ глифа для `BricksIcon`. */
    icon: string;
    /**
     * Доступное имя и текст тултипа. Обязательно: из одного глифа назначение
     * кнопки не следует ни для скринридера, ни для глаза.
     */
    label: string;
    /**
     * Текст тултипа, когда он не совпадает с именем: у закрытой кнопки подсказка
     * объясняет ПРИЧИНУ запрета, но именем кнопки остаётся само действие.
     */
    hint?: string;
    variant?: TBricksIconButtonVariant;
    size?: TBricksIconButtonSize;
    /** Разрушающее действие: удаление, отключение. */
    danger?: boolean;
    /**
     * Состояние переключателя. Не задан — кнопка не переключатель и
     * `aria-pressed` не получает вовсе, иначе скринридер объявил бы нажимаемым
     * каждое обычное действие.
     */
    active?: boolean;
    /** Обычный запрет: кнопка уходит из обхода с клавиатуры. */
    disabled?: boolean;
    /**
     * Запрет с причиной: кнопка остаётся фокусируемой, объявляется через
     * `aria-disabled`, клик гасит обработчик. Нужен там, где причину запрета
     * человеку надо прочитать, — выключенная кнопка унесла бы её с собой.
     */
    muted?: boolean;
    /** Над кнопкой идёт операция: курсор ожидания вместо курсора отказа. */
    busy?: boolean;
    tooltipSide?: TBricksIconButtonTooltipSide;
}

export interface IBricksIconButtonEmits {
    click: [event: MouseEvent];
}
