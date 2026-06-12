<script setup lang="ts">
// #region Imports
// Types
import type { ISpaceProps } from '../types/blockProps';

// Vue
import { computed, ref, inject, type Ref } from 'vue';
// #endregion

// #region Props
const props = defineProps<{
    layoutProps: ISpaceProps;
}>();
// #endregion

// #region Data
const showGrid = inject<Ref<boolean>>('showGrid', ref(true));
type TSpaceStyle = Record<string, string>;
// #endregion

// #region Methods
/**
 * Нормализует значение размера, добавляя 'rem' если это число.
 * Поддерживает обратную совместимость со строковыми значениями ('2.4rem').
 *
 * @param rawSize - Значение размера (число или строка)
 * @returns Строка с единицей измерения
 */
function normalizeSize(rawSize: string | number | undefined): string {
    if (rawSize === undefined || rawSize === null) {
        return '2.4rem';
    }

    // Если число - добавляем rem
    if (typeof rawSize === 'number') {
        return `${rawSize}rem`;
    }

    const trimmed = String(rawSize).trim();
    if (!trimmed) {
        return '2.4rem';
    }

    // Если просто число в строке - добавляем rem
    if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
        return `${trimmed}rem`;
    }

    // Иначе возвращаем как есть (уже с единицей измерения)
    return trimmed;
}
// #endregion

// #region Computed
const normalizedSize = computed<string>(() => normalizeSize(props.layoutProps.size));

const spaceStyle = computed<TSpaceStyle>(() => {
    const style: TSpaceStyle = {
        backgroundColor: 'transparent',
    };

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

const dividerStyle = computed<TSpaceStyle>((): TSpaceStyle => {
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
    border: 1px dashed rgb(var(--rgb-gray) / 30%);
    background: repeating-linear-gradient(
        45deg,
        rgb(var(--rgb-gray) / 10%),
        rgb(var(--rgb-gray) / 10%) 1rem,
        transparent 1rem,
        transparent 2rem
    );

    &:hover {
        border-color: rgb(var(--rgb-gray) / 50%);
        background: repeating-linear-gradient(
            45deg,
            rgb(var(--rgb-gray) / 15%),
            rgb(var(--rgb-gray) / 15%) 1rem,
            transparent 1rem,
            transparent 2rem
        );
    }

    &.gridHidden {
        border-color: transparent;
        background: transparent;

        &:hover {
            border-color: transparent;
            background: transparent;
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
