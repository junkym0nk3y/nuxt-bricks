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
    /**
     * Tells the bar that the consumer draws an action of its own next to this tab
     * through the `item-action` slot, so the tab has to make room for it: the caption
     * gives up its right padding and the trailing gap moves to the wrapper. A per-item
     * flag rather than a check of the slot, because an action usually appears on some
     * of the tabs only — and on the same tab it comes and goes (a managing mode, a
     * right to delete), while the slot outlet itself stays mounted so the consumer can
     * animate what it puts inside.
     */
    hasAction?: boolean;
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

export interface IBricksTabBarSlots {
    /**
     * An action of the consumer standing next to the tab — a delete button and the
     * like. It is rendered as a neighbor of the toggle rather than inside it: a button
     * within a button is not allowed, and a second `ToggleGroupItem` would change the
     * selection on a click. The kit owns the place and the spacing of the action, the
     * consumer owns what goes into it.
     */
    'item-action': (props: { item: IBricksTabItem }) => unknown;
}

export interface IBricksTabBarItemProps {
    item: IBricksTabItem;
    /** Trims the right padding of the caption when an action stands next to the tab */
    hasAction: boolean;
    variant: TBricksTabBarVariant;
    size: TBricksTabBarSize;
    tone: TBricksTabBarTone;
    radius?: TBricksTabBarRadius;
    iconOnly: boolean;
    block: boolean;
}
