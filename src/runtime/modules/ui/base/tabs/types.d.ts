/**
 * Типы таб-бара `BricksTabBar` и его элемента `BricksTabBarItem`.
 */

export type TBricksTabBarVariant = 'segmented' | 'outline' | 'underline' | 'ghost';

export type TBricksTabBarSize = 'sm' | 'md';

/** Цветовая схема выбранного таба: нейтральная пилюля или заливка primary. */
export type TBricksTabBarTone = 'neutral' | 'primary';

/** Скругление таба; не задан — берётся базовое для стиля (segmented `xs`, outline `sm`). */
export type TBricksTabBarRadius = 'xs' | 'sm';

export interface IBricksTabItem {
    value: string;
    /**
     * Подпись таба — обязательна даже при `iconOnly`: там она не рисуется, но
     * остаётся доступным именем. Пока подпись была необязательной, таб с одной
     * иконкой и без тултипа получал `aria-label="undefined"` и читался как
     * безымянная кнопка.
     */
    label: string;
    icon?: string;
    count?: number;
    disabled?: boolean;
    /** Подсказка при наведении; доступное имя берётся из `label`, а не отсюда. */
    tooltip?: string;
}

export interface IBricksTabBarProps {
    /**
     * Выбранное значение — обязано совпадать со значением одного из включённых
     * `items`. Значение «мимо списка» (или указывающее на `disabled`) оставляет
     * группу без выбранного таба, и тогда первый же вход фокусом активирует
     * первый доступный таб: reka активирует таб при получении фокуса, поэтому
     * потребитель получит `update:modelValue` от простого перехода табом.
     */
    modelValue: string;
    items: IBricksTabItem[];
    /**
     * Имя группы для скринридера: дорожка без него читается как россыпь кнопок.
     * Не `ariaLabel`: одноимённый проп в шаблоне пришлось бы писать camelCase —
     * `:aria-label` компилятор считает нативным атрибутом, а не пропом.
     */
    groupLabel: string;
    variant?: TBricksTabBarVariant;
    size?: TBricksTabBarSize;
    tone?: TBricksTabBarTone;
    radius?: TBricksTabBarRadius;
    iconOnly?: boolean;
    block?: boolean;
    /**
     * Разрешает дорожке переносить табы на следующую строку. Нужен там, где
     * ширина не под контролем компонента (фильтры в модалке): без переноса ряд
     * подписей — один неделимый flex-элемент, и в узком контейнере он вылезает
     * за край, а не переходит на вторую строку.
     */
    wrap?: boolean;
}

export interface IBricksTabBarEmits {
    'update:modelValue': [value: string];
}

export interface IBricksTabBarItemProps {
    item: IBricksTabItem;
    variant: TBricksTabBarVariant;
    size: TBricksTabBarSize;
    tone: TBricksTabBarTone;
    radius?: TBricksTabBarRadius;
    iconOnly: boolean;
    block: boolean;
}
