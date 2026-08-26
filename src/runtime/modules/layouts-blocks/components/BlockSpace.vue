<script setup lang="ts">
// #region Imports
// Types
import type { IBlockSpaceProps } from '../types/blockProps';

// Vue
import { computed, ref, inject, type Ref } from 'vue';

// Utils
import { normalizeSpaceSize } from '../utils/spaceSize';
// #endregion

// #region Props
const props = withDefaults(defineProps<IBlockSpaceProps>(), {});
// #endregion

// #region Data
const showGrid = inject<Ref<boolean>>('showGrid', ref(true));
// #endregion

// #region Computed
const normalizedSize = computed<string>(() => normalizeSpaceSize(props.layoutProps.size));

const spaceStyle = computed<Record<string, string>>(() => {
    // The spacer background stays entirely in CSS: an inline `background-color`
    // overrode the editor backing and the hover highlight of the zone. In CSS it is a
    // delicate diagonal hatch rather than a squared-paper grid, so the spacer reads as
    // empty space without fighting the canvas grid or shimmering at small heights.
    const style: Record<string, string> = {};

    if (props.layoutProps.direction === 'vertical' || props.layoutProps.direction === 'both') {
        style.height = normalizedSize.value;
    }
    if (props.layoutProps.direction === 'horizontal' || props.layoutProps.direction === 'both') {
        style.width = normalizedSize.value;
    }

    if (props.layoutProps.showDivider) {
        style.display = 'flex';
        style.alignItems = 'flex-end';
        style.justifyContent = 'center';
    }

    return style;
});

const isVerticalDivider = computed<boolean>(
    () => props.layoutProps.direction === 'vertical' || props.layoutProps.direction === 'both'
);

const dividerStyle = computed<Record<string, string>>((): Record<string, string> => {
    const lp = props.layoutProps;
    const color = lp.dividerColor || 'var(--bricks-base-200)';
    const borderWidth = `${Math.max(1, Number(lp.dividerWidth) || 1)}px`;
    const lineStyle = lp.dividerStyle || 'solid';
    const mx = Math.round(Math.max(0, Number(lp.dividerMarginX) || 0) * 10) / 10;

    if (isVerticalDivider.value) {
        return {
            borderTop: `${borderWidth} ${lineStyle} ${color}`,
            width: mx > 0 ? `calc(100% - ${mx * 2}rem)` : '100%',
        };
    }

    return {
        borderLeft: `${borderWidth} ${lineStyle} ${color}`,
        height: mx > 0 ? `calc(100% - ${mx * 2}rem)` : '100%',
    };
});
// #endregion
</script>

<template>
    <div :class="[$style.BlockSpace, { [$style.gridHidden]: !showGrid }]" :style="spaceStyle">
        <hr
            v-if="props.layoutProps.showDivider"
            :class="[
                $style.divider,
                isVerticalDivider ? $style.dividerHorizontal : $style.dividerVertical,
            ]"
            :style="dividerStyle"
        />
    </div>
</template>

<style module lang="scss">
.BlockSpace {
    position: relative;
    overflow: hidden;
    border: 1px dashed var(--bricks-base-300);
    background-color: color-mix(in srgb, var(--bricks-base-200) 22%, transparent);
    background-image: repeating-linear-gradient(
        135deg,
        color-mix(in srgb, var(--bricks-base-400) 14%, transparent) 0 0.1rem,
        transparent 0.1rem 0.6rem
    );
    transition:
        border-color var(--bricks-default-transition),
        background-color var(--bricks-default-transition),
        box-shadow var(--bricks-default-transition);

    &:hover {
        border-color: var(--bricks-primary);
        background-color: color-mix(in srgb, var(--bricks-primary) 6%, transparent);
        background-image: repeating-linear-gradient(
            135deg,
            color-mix(in srgb, var(--bricks-primary) 18%, transparent) 0 0.1rem,
            transparent 0.1rem 0.6rem
        );
    }

    &.gridHidden {
        border-color: transparent;
        background-color: transparent;
        background-image: none;

        &:hover {
            border-color: transparent;
            background-color: transparent;
            background-image: none;
            box-shadow: none;
        }
    }
}

.divider {
    flex-shrink: 0;
    border: none;
}

.dividerHorizontal {
    width: 100%;
    height: 0;
}

.dividerVertical {
    width: 0;
    height: 100%;
}
</style>
