/** Варианты оформления плашки — ровно те, под которые в `BricksBadge.vue` есть классы. */
export type TBricksBadgeVariant = 'primary' | 'neutral';

export interface IBricksBadgeProps {
    variant?: TBricksBadgeVariant;
}
