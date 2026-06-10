<script setup lang="ts">
// #region Imports
// Types
import type {
    ILandingCanvasToolbarProps,
    ILandingCanvasToolbarEmits,
    IViewportOption,
    TViewportType,
} from './types';

// Vue
import { computed } from 'vue';

// Composables
import { useLandingConfig } from '../../../composables/useLandingConfig';

// Components
import BricksButton from '../../../ui/base/button/BricksButton.vue';
// #endregion

// #region Props
const props = defineProps<ILandingCanvasToolbarProps>();
// #endregion

// #region Emits
const emit = defineEmits<ILandingCanvasToolbarEmits>();
// #endregion

// #region Data
const config = useLandingConfig();

const VIEWPORTS: readonly IViewportOption[] = [
    {
        value: 'mobile',
        label: 'Mobile',
        icon: 'ak:mobile-device',
        width: config.canvasBreakpoints.mobile.width,
    },
    {
        value: 'tablet',
        label: 'Tablet',
        icon: 'ak:credit-card-alt-1',
        width: config.canvasBreakpoints.tablet.width,
    },
    {
        value: 'desktop',
        label: 'Desktop',
        icon: 'ak:desktop-device',
        width: config.canvasBreakpoints.desktop.width,
    },
] as const;
// #endregion

// #region Computed
const scalePercent = computed(() => Math.round(props.scale * 100));
const normalizedSidebarOffset = computed(() => {
    const offset = props.sidebarOffset?.trim();
    return offset && offset !== '0' ? offset : '0px';
});
const toolbarStyle = computed(() => {
    const offset = normalizedSidebarOffset.value;
    return {
        marginLeft: offset,
        width: `calc(100vw - ${offset})`,
    };
});
// #endregion

// #region Methods
/**
 * Handles zoom in action.
 */
function handleZoomIn(): void {
    emit('zoomIn');
}

/**
 * Handles zoom out action.
 */
function handleZoomOut(): void {
    emit('zoomOut');
}

/**
 * Resets zoom to default scale.
 */
function handleZoomReset(): void {
    emit('zoomReset');
}

/**
 * Changes viewport type (mobile/tablet/desktop).
 *
 * @param viewport - Next viewport preset selected by the user.
 */
function handleViewportChange(viewport: TViewportType): void {
    emit('update:viewport', viewport);
}

/**
 * Toggles Figma Mode (three viewports side by side).
 */
function handleToggleFigmaMode(): void {
    emit('toggleFigmaMode');
}

// #endregion
</script>

<template>
    <div :class="$style.BricksCanvasToolbar" :style="toolbarStyle">
        <!-- Viewport switcher -->
        <div :class="$style.viewportGroup">
            <BricksButton
                v-for="vp in VIEWPORTS"
                :key="vp.value"
                size="sm"
                variant="secondary"
                :active="!props.isFigmaMode && props.viewport === vp.value"
                :class="$style.viewportButton"
                @click="handleViewportChange(vp.value)"
            >
                <BricksLandIcon :icon="vp.icon" />
                <span :class="$style.viewportLabel">{{ vp.label }}</span>
                <span :class="$style.viewportWidth">{{ vp.width }}px</span>
            </BricksButton>

            <BricksButton
                size="sm"
                variant="secondary"
                :active="props.isFigmaMode"
                :class="$style.viewportButton"
                @click="handleToggleFigmaMode"
            >
                <BricksLandIcon icon="ak:figma-fill" />
                <span :class="$style.viewportLabel">Figma Like</span>
            </BricksButton>
        </div>

        <!-- Zoom controls -->
        <div :class="$style.zoomGroup">
            <BricksButton
                size="sm"
                variant="secondary"
                :class="$style.zoomButton"
                title="Zoom out"
                @click="handleZoomOut"
            >
                <BricksLandIcon :class="$style.zoomIcon" icon="an:outlined-zoom-out" />
            </BricksButton>

            <client-only>
                <BricksButton
                    size="sm"
                    variant="secondary"
                    :class="$style.scaleButton"
                    title="Reset zoom"
                    @click="handleZoomReset"
                >
                    {{ scalePercent }}%
                </BricksButton>
            </client-only>

            <BricksButton
                size="sm"
                variant="secondary"
                :class="$style.zoomButton"
                title="Zoom in"
                @click="handleZoomIn"
            >
                <BricksLandIcon :class="$style.zoomIcon" icon="an:outlined-zoom-in" />
            </BricksButton>
        </div>
    </div>
</template>

<style module lang="scss">
.BricksCanvasToolbar {
    position: absolute;
    z-index: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    height: 5rem;
    padding: 0 2rem;
    gap: 2rem;
}

.viewportGroup {
    display: flex;
    gap: 0.4rem;
}

.viewportButton {
    min-width: 14rem;
    box-shadow: 0 0.2rem 0.4rem rgb(0 0 0 / 8%);
}

.viewportIcon {
    font-size: 1.6rem;
}

.viewportLabel {
    font-weight: 500;
}

.viewportWidth {
    font-size: 1.2rem;
}

.zoomGroup {
    display: flex;
    align-items: center;
    gap: 0.4rem;
}

.zoomButton {
    min-width: 3.2rem;
}

.zoomIcon {
    font-size: 2rem;
    font-weight: 300;
    color: var(--land-base-600);
}

.scaleButton {
    min-width: 6rem;
    font-weight: 500;
}
</style>
