<script setup lang="ts">
// #region Imports
// Types
import type { ICanvasBottomBarProps, ICanvasBottomBarEmits } from '../../types/components';
import type { IBricksTabItem } from '../../../../ui/base/tabs/types.d.ts';

// Vue
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

// Pinia
import { useComponentsStore } from '../../../core/stores/components';
import { useCanvasStore } from '../../../core/stores/canvas';
import { useHistoryStore } from '../../../core/stores/history';

// Composables
import { useBuilderPermissions } from '../../../core/composables/useBuilderPermissions';

// Components
import BricksButton from '../../../../ui/base/button/BricksButton.vue';
import BricksTabBar from '../../../../ui/base/tabs/BricksTabBar.vue';
import BricksTooltip from '../../../../ui/tooltip/BricksTooltip.vue';
import BricksTooltipHint from '../../../../ui/tooltip/BricksTooltipHint.vue';

// Utils
import { resolveDeviceIcon } from '../../../../common/utils/bricks/devices';
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
const componentsStore = useComponentsStore();
const canvasStore = useCanvasStore();
const historyStore = useHistoryStore();
const { canEdit } = useBuilderPermissions();

/** Значение таба «Figma Like»: режим стоит в одном ряду с вьюпортами, но не является ими. */
const FIGMA_MODE_VALUE = 'figma';

// #endregion

// #region Computed
const scalePercent = computed(() => Math.round(props.scale * 100));

// Подписей у табов нет с прошлого редизайна — они уехали в тултип, поэтому
// четвёртое устройство стоит бару ровно ширины ещё одной иконки
const viewportItems = computed<IBricksTabItem[]>(() => [
    ...canvasStore.devices.map((device) => ({
        value: device.key,
        icon: resolveDeviceIcon(device.icon),
        label: device.label,
        tooltip: `${device.label} · ${device.width}px`,
    })),
    {
        value: FIGMA_MODE_VALUE,
        icon: 'ta:outline-brand-figma',
        label: 'Figma Like',
        tooltip: 'Figma Like',
    },
]);

/** Figma mode вытесняет выбранный вьюпорт, поэтому в баре выбран либо он, либо вьюпорт. */
const activeViewportValue = computed<string>(() =>
    props.isFigmaMode ? FIGMA_MODE_VALUE : props.viewport
);

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
 * Переключает режим просмотра канваса: три вьюпорта и Figma mode — одна группа
 * взаимоисключающих режимов. Повторный выбор активного таба ничего не делает,
 * поэтому выход из Figma mode — это выбор вьюпорта.
 *
 * @param value - Значение выбранного таба.
 */
function handleSelectViewport(value: string): void {
    if (value === FIGMA_MODE_VALUE) {
        if (!props.isFigmaMode) {
            emit('toggleFigmaMode');
        }

        return;
    }

    const device = canvasStore.devices.find((item) => item.key === value);
    if (!device) {
        return;
    }

    emit('update:viewport', device.key);
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
            <BricksTabBar
                :model-value="activeViewportValue"
                :items="viewportItems"
                variant="ghost"
                size="md"
                tone="primary"
                radius="sm"
                icon-only
                :group-label="t('bricks.canvas.viewportLabel')"
                @update:model-value="handleSelectViewport"
            />

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

            <template v-if="canEdit">
                <div :class="$style.divider" />

                <!--
                    Отмена и повтор — правки схемы: без права правки истории не
                    появится вовсе, и кнопки остались бы навсегда пустыми
                -->
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
                                <BricksIcon
                                    :class="$style.icon"
                                    icon="ta:outline-arrow-forward-up"
                                />
                            </BricksButton>
                        </template>

                        <template #default>
                            <BricksTooltipHint :text="t('bricks.toolbar.redo')" />
                        </template>
                    </BricksTooltip>
                </div>
            </template>

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
