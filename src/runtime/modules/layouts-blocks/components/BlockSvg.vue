<script setup lang="ts">
// #region Imports
// Types
import type { IBlockSvgProps } from '../types/blockProps';

// Vue
import { computed } from 'vue';

// Utils
import { sanitizeSvgMarkup } from '../../common/utils/sanitize/sanitizeSvg';
import { applyColorToSvgContent } from '../utils/inlineContent';
// #endregion

// #region Props
const props = withDefaults(defineProps<IBlockSvgProps>(), {
    componentId: undefined,
    src: '',
    svgContent: '',
    color: '',
    width: '4.8rem',
    height: '4.8rem',
    alignment: 'left',
    marginTop: 0,
    marginBottom: 0,
    emptyLabel: '',
});
// #endregion

// #region Computed
const hasSvgContent = computed(() => Boolean(props.svgContent?.trim()));
const hasSource = computed(() => Boolean(props.src?.trim()));
const hasSvg = computed(() => hasSvgContent.value || hasSource.value);

const colorizedSvg = computed<string>(() => {
    if (!hasSvg.value) {
        return '';
    }

    // Sanitizing comes AFTER colorize: only the sanitizer output ever reaches v-html
    return sanitizeSvgMarkup(applyColorToSvgContent(props.svgContent!, props.color || undefined));
});

/**
 * Resolves dimension value to CSS string.
 */
const resolvedWidth = computed<string>(() => resolveDimension(props.width));
const resolvedHeight = computed<string>(() => resolveDimension(props.height));

/**
 * Wrapper styles of the block.
 *
 * The margins accept a ready CSS value as well as a number: the published render hands
 * over the variable of the device (`var(--bricks-svg-mt)`), and the value of the active
 * step is chosen by the generated rule. A margin nobody set stays undeclared, so a
 * stylesheet of the consumer keeps its say over it.
 *
 * The alignment always reads a variable with the base value as its fallback — it was
 * always declared here, and there is nothing for the outside to lose.
 */
const wrapperStyle = computed<Record<string, string>>(() => {
    const style: Record<string, string> = {
        display: 'flex',
    };

    const marginTop = resolveSpacing(props.marginTop);
    const marginBottom = resolveSpacing(props.marginBottom);

    if (marginTop) {
        style.marginTop = marginTop;
    }
    if (marginBottom) {
        style.marginBottom = marginBottom;
    }

    style.justifyContent = `var(--bricks-svg-justify, ${mapSvgAlignment(props.alignment)})`;

    return style;
});

const svgContainerStyle = computed<Record<string, string>>(() => ({
    width: resolvedWidth.value,
    height: resolvedHeight.value,
    color: props.color || 'inherit',
}));
// #endregion

// #region Methods
/**
 * The `justify-content` an alignment of the block stands for.
 *
 * @param alignment - Alignment declared by the property.
 * @returns CSS value of `justify-content`.
 */
function mapSvgAlignment(alignment: string): string {
    const alignMap: Record<string, string> = {
        left: 'flex-start',
        center: 'center',
        right: 'flex-end',
    };

    return alignMap[alignment] || 'flex-start';
}

/**
 * A margin as a CSS value: a number becomes rem, a ready CSS value (the per-device
 * variable of the published render) travels through, and nothing at all stays nothing
 * — an undeclared margin leaves the styling of the consumer alone.
 *
 * @param value - Value of the margin property.
 * @returns CSS value, or an empty string when there is no margin to declare.
 */
function resolveSpacing(value: string | number | undefined): string {
    if (typeof value === 'string' && value.trim() && !/^-?\d+(\.\d+)?$/.test(value.trim())) {
        return value.trim();
    }

    const rem = Math.max(0, Number(value) || 0);

    return rem > 0 ? `${rem}rem` : '';
}

/**
 * Converts number to rem or returns string as-is.
 */
function resolveDimension(value: string | number | undefined): string {
    if (value === undefined || value === null) {
        return 'auto';
    }

    if (typeof value === 'number') {
        return `${value}rem`;
    }

    const trimmed = String(value).trim();
    if (!trimmed) {
        return 'auto';
    }

    if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
        return `${trimmed}rem`;
    }

    return trimmed;
}
// #endregion
</script>

<template>
    <div :class="$style.BlockSvg" :style="wrapperStyle">
        <!-- eslint-disable vue/no-v-html -->
        <div
            v-if="hasSvgContent"
            :class="$style.svgContainer"
            :style="svgContainerStyle"
            v-html="colorizedSvg"
        />
        <!-- eslint-enable vue/no-v-html -->

        <img
            v-else-if="hasSource"
            :src="props.src"
            :class="$style.svgImage"
            :style="svgContainerStyle"
            alt="SVG"
            loading="lazy"
            decoding="async"
        />

        <div v-else-if="props.emptyLabel" :class="$style.placeholder">
            <BricksIcon :class="$style.placeholderIcon" icon="ta:outline-photo" />
            <span :class="$style.placeholderText">{{ props.emptyLabel }}</span>
        </div>
    </div>
</template>

<style module lang="scss">
.BlockSvg {
    position: relative;
    width: 100%;
}

.svgContainer {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;

    :global(svg) {
        width: 100%;
        height: 100%;
    }
}

.svgImage {
    display: block;
    flex-shrink: 0;
    object-fit: contain;
}

.placeholder {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    min-height: 10rem;
    border: 0.2rem dashed var(--bricks-base-300);
    background: var(--bricks-base-50);
    text-align: center;
    flex-direction: column;
    gap: 1.2rem;
}

.placeholderIcon {
    font-size: 4.8rem;
    color: var(--bricks-base-300);
}

.placeholderText {
    font-size: 1.4rem;
    color: var(--bricks-base-500);
}
</style>
