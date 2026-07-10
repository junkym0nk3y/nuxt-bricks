<script setup lang="ts">
// #region Imports
// Types
import type {
    ICanvasBottomBarProps,
    ICanvasBottomBarEmits,
    IViewportOption,
} from '../../types/components';
import type { TBricksDeviceKey } from '../../../../common/types/brick';

// Vue
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

// Pinia
import { useComponentsStore } from '../../../core/stores/components';
import { useCanvasStore } from '../../../core/stores/canvas';
import { useHistoryStore } from '../../../core/stores/history';

// Composables
import { useBricksConfig } from '../../../../common/composables/useBricksConfig';

// Components
import BricksButton from '../../../../ui/base/button/BricksButton.vue';
import BricksTooltip from '../../../../ui/tooltip/BricksTooltip.vue';
import BricksTooltipHint from '../../../../ui/tooltip/BricksTooltipHint.vue';
// #endregion

// #region Props
const props = withDefaults(defineProps<ICanvasBottomBarProps>(), {
    sidebarOffset: '',
    rightSidebarOffset: '',
    isFigmaMode: false,
});
// #endregion

// #region Emits
const emit = defineEmits<ICanvasBottomBarEmits>();
// #endregion

// #region Data
const { t } = useI18n();
const config = useBricksConfig();
const componentsStore = useComponentsStore();
const canvasStore = useCanvasStore();
const historyStore = useHistoryStore();

const VIEWPORTS: readonly IViewportOption[] = [
    {
        value: 'mobile',
        label: 'Mobile',
        icon: 'ta:outline-device-mobile',
        width: config.canvasBreakpoints.mobile.width,
    },
    {
        value: 'tablet',
        label: 'Tablet',
        icon: 'ta:outline-device-tablet',
        width: config.canvasBreakpoints.tablet.width,
    },
    {
        value: 'desktop',
        label: 'Desktop',
        icon: 'ta:outline-device-desktop',
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

const normalizedRightSidebarOffset = computed(() => {
    const offset = props.rightSidebarOffset?.trim();
    return offset && offset !== '0' ? offset : '0px';
});

/**
 * Центрирует бар относительно видимой области канваса между сайдбарами
 * (родитель уже не включает вертикальный рейл, поэтому 100%, а не 100vw).
 */
const wrapperStyle = computed(() => {
    const offset = normalizedSidebarOffset.value;
    const rightOffset = normalizedRightSidebarOffset.value;
    return {
        marginLeft: offset,
        width: `calc(100% - ${offset} - ${rightOffset})`,
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
function handleViewportChange(viewport: TBricksDeviceKey): void {
    emit('update:viewport', viewport);
}

/**
 * Toggles Figma Mode (three viewports side by side).
 */
function handleToggleFigmaMode(): void {
    emit('toggleFigmaMode');
}

/**
 * Отменяет последнее действие (Undo) через store компонентов.
 */
function handleUndo(): void {
    if (historyStore.canUndo) {
        componentsStore.undo();
    }
}

/**
 * Повторяет отменённое действие (Redo) через store компонентов.
 */
function handleRedo(): void {
    if (historyStore.canRedo) {
        componentsStore.redo();
    }
}
// #endregion
</script>

<template>
    <div :class="$style.BuilderCanvasBottomBar" :style="wrapperStyle">
        <div :class="$style.bar">
            <!-- Viewport switcher -->
            <div :class="$style.group">
                <BricksTooltip v-for="vp in VIEWPORTS" :key="vp.value" top>
                    <template #activator>
                        <BricksButton
                            size="sm"
                            variant="ghost"
                            equal
                            :active="!props.isFigmaMode && props.viewport === vp.value"
                            :aria-label="vp.label"
                            @click="handleViewportChange(vp.value)"
                        >
                            <BricksIcon :class="$style.icon" :icon="vp.icon" />
                        </BricksButton>
                    </template>

                    <template #default>
                        <BricksTooltipHint :text="`${vp.label} · ${vp.width}px`" />
                    </template>
                </BricksTooltip>

                <BricksTooltip top>
                    <template #activator>
                        <BricksButton
                            size="sm"
                            variant="ghost"
                            equal
                            :active="props.isFigmaMode"
                            aria-label="Figma Like"
                            @click="handleToggleFigmaMode"
                        >
                            <BricksIcon :class="$style.icon" icon="ta:outline-brand-figma" />
                        </BricksButton>
                    </template>

                    <template #default>
                        <BricksTooltipHint text="Figma Like" />
                    </template>
                </BricksTooltip>
            </div>

            <div :class="$style.divider" />

            <!-- Zoom controls -->
            <div :class="$style.group">
                <BricksTooltip top>
                    <template #activator>
                        <BricksButton
                            size="sm"
                            variant="ghost"
                            equal
                            :aria-label="t('bricks.canvas.zoomOut')"
                            @click="handleZoomOut"
                        >
                            <BricksIcon :class="$style.icon" icon="ta:outline-zoom-out" />
                        </BricksButton>
                    </template>

                    <template #default>
                        <BricksTooltipHint :text="t('bricks.canvas.zoomOut')" />
                    </template>
                </BricksTooltip>

                <client-only>
                    <BricksTooltip top>
                        <template #activator>
                            <BricksButton
                                size="sm"
                                variant="ghost"
                                :class="$style.scaleButton"
                                @click="handleZoomReset"
                            >
                                {{ scalePercent }}%
                            </BricksButton>
                        </template>

                        <template #default>
                            <BricksTooltipHint :text="t('bricks.canvas.zoomReset')" />
                        </template>
                    </BricksTooltip>
                </client-only>

                <BricksTooltip top>
                    <template #activator>
                        <BricksButton
                            size="sm"
                            variant="ghost"
                            equal
                            :aria-label="t('bricks.canvas.zoomIn')"
                            @click="handleZoomIn"
                        >
                            <BricksIcon :class="$style.icon" icon="ta:outline-zoom-in" />
                        </BricksButton>
                    </template>

                    <template #default>
                        <BricksTooltipHint :text="t('bricks.canvas.zoomIn')" />
                    </template>
                </BricksTooltip>
            </div>

            <div :class="$style.divider" />

            <!-- History -->
            <div :class="$style.group">
                <BricksTooltip top>
                    <template #activator>
                        <BricksButton
                            size="sm"
                            variant="ghost"
                            equal
                            :disabled="!historyStore.canUndo"
                            :aria-label="t('bricks.toolbar.undo')"
                            @click="handleUndo"
                        >
                            <BricksIcon :class="$style.icon" icon="ta:outline-arrow-back-up" />
                        </BricksButton>
                    </template>

                    <template #default>
                        <BricksTooltipHint :text="t('bricks.toolbar.undo')" />
                    </template>
                </BricksTooltip>

                <BricksTooltip top>
                    <template #activator>
                        <BricksButton
                            size="sm"
                            variant="ghost"
                            equal
                            :disabled="!historyStore.canRedo"
                            :aria-label="t('bricks.toolbar.redo')"
                            @click="handleRedo"
                        >
                            <BricksIcon :class="$style.icon" icon="ta:outline-arrow-forward-up" />
                        </BricksButton>
                    </template>

                    <template #default>
                        <BricksTooltipHint :text="t('bricks.toolbar.redo')" />
                    </template>
                </BricksTooltip>
            </div>

            <div :class="$style.divider" />

            <!-- Grid toggle -->
            <div :class="$style.group">
                <BricksTooltip top>
                    <template #activator>
                        <BricksButton
                            size="sm"
                            variant="ghost"
                            equal
                            :active="canvasStore.showGrid"
                            :aria-label="t('bricks.toolbar.grid')"
                            @click="canvasStore.toggleGrid"
                        >
                            <BricksIcon :class="$style.icon" icon="ta:outline-grid-4x4" />
                        </BricksButton>
                    </template>

                    <template #default>
                        <BricksTooltipHint :text="t('bricks.toolbar.grid')" />
                    </template>
                </BricksTooltip>
            </div>
        </div>
    </div>
</template>

<style module lang="scss">
.BuilderCanvasBottomBar {
    position: absolute;
    bottom: 2rem;
    left: 0;
    z-index: 10;
    display: flex;
    justify-content: center;
    transition:
        margin var(--bricks-default-transition),
        width var(--bricks-default-transition);
    pointer-events: none;
}

.bar {
    display: flex;
    align-items: center;
    padding: 0.4rem;
    border-radius: 1.2rem;
    border: 1px solid var(--bricks-base-300);
    background-color: var(--bricks-base-0);
    box-shadow: var(--bricks-shadow-md);
    pointer-events: auto;
    gap: 0.4rem;
}

.group {
    display: flex;
    align-items: center;
    gap: 0.2rem;
}

.divider {
    width: 1px;
    height: 2.4rem;
    margin: 0 0.4rem;
    background-color: var(--bricks-base-300);
}

.icon {
    font-size: 1.8rem;
}

.scaleButton {
    min-width: 5.6rem;
    font-weight: 500;
}
</style>
