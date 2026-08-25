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

const wrapperStyle = computed<Record<string, string>>(() => {
    const style: Record<string, string> = {
        display: 'flex',
    };

    const mt = Math.max(0, Number(props.marginTop) || 0);
    const mb = Math.max(0, Number(props.marginBottom) || 0);

    if (mt > 0) {
        style.marginTop = `${mt}rem`;
    }
    if (mb > 0) {
        style.marginBottom = `${mb}rem`;
    }

    const alignMap: Record<string, string> = {
        left: 'flex-start',
        center: 'center',
        right: 'flex-end',
    };
    style.justifyContent = alignMap[props.alignment] || 'flex-start';

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
