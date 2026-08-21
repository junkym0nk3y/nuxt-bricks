/**
 * Types of the `BricksTabBar` tab bar and its `BricksTabBarItem` element.
 */

export type TBricksTabBarVariant = 'segmented' | 'outline' | 'underline' | 'ghost';

export type TBricksTabBarSize = 'sm' | 'md';

/** Color scheme of the selected tab: a neutral pill or a primary fill */
export type TBricksTabBarTone = 'neutral' | 'primary';

/**
 * Radius of the bar and its tabs; unset takes the variant's base one — `xs` on a
 * segmented bar (its tabs `0.2rem` less), `sm` on an outline one.
 */
export type TBricksTabBarRadius = 'xs' | 'sm';

export interface IBricksTabItem {
    value: string;
    /**
     * Tab caption — required even with `iconOnly`: there it is not drawn but
     * still serves as the accessible name. While the caption was optional, a tab
     * with an icon and no tooltip got `aria-label="undefined"` and read as a
     * nameless button.
     */
    label: string;
    icon?: string;
    count?: number;
    disabled?: boolean;
    /** Hover hint; the accessible name comes from `label`, not from here */
    tooltip?: string;
}

export interface IBricksTabBarProps {
    /**
     * The selected value — it must match the value of one of the enabled
     * `items`. A value outside the list (or pointing at a `disabled` one) leaves
     * the group without a pressed tab: nothing is announced as selected, and it
     * stays that way until a click or Enter/Space. Focus alone does not choose
     * anything — that was the `Tabs` behavior the component deliberately moved
     * away from (see the header of `BricksTabBar.vue`).
     */
    modelValue: string;
    items: IBricksTabItem[];
    /**
     * Group name for a screen reader: without it the bar reads as a scattering
     * of buttons. Not `ariaLabel`: a prop of that name would have to be written
     * in camelCase in the template — the compiler treats `:aria-label` as a
     * native attribute, not as a prop.
     */
    groupLabel: string;
    variant?: TBricksTabBarVariant;
    size?: TBricksTabBarSize;
    tone?: TBricksTabBarTone;
    radius?: TBricksTabBarRadius;
    iconOnly?: boolean;
    block?: boolean;
    /**
     * Allows the bar to wrap tabs onto the next line. Needed where the width is
     * not under the component's control (filters inside a modal): without
     * wrapping a row of captions is one indivisible flex item, and in a narrow
     * container it overflows the edge instead of moving to a second line.
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
