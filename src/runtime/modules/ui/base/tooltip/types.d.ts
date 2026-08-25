export interface IBricksTooltipProps {
    nudge?: number;
    /**
     * Side of the activator to show on. `bottom` is the default and has no prop of
     * its own: a flag that changes nothing reads as a switch and is not one.
     */
    top?: boolean;
    left?: boolean;
    right?: boolean;
    hoverable?: boolean;
    text?: string;
}

export interface IBricksTooltipHintProps {
    text: string;
}
