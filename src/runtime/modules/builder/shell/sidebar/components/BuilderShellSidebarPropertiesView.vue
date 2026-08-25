<script setup lang="ts">
// #region Imports
// Types
import type { TBricksDeviceKey } from '../../../../common/types/brick';
import type { IBricksTabItem } from '../../../../ui/base/tabs/types.d.ts';

// Vue
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

// Pinia
import { useCanvasStore } from '../../../core/stores/canvas';

// Components
import BricksButton from '../../../../ui/base/button/BricksButton.vue';
import BricksCloseButton from '../../../../ui/base/modal/BricksCloseButton.vue';
import BricksTabBar from '../../../../ui/base/tabs/BricksTabBar.vue';
import BuilderShellSidebarPropertyEditors from './BuilderShellSidebarPropertyEditors.vue';
import BricksTooltip from '../../../../ui/base/tooltip/BricksTooltip.vue';
import BricksTooltipHint from '../../../../ui/base/tooltip/BricksTooltipHint.vue';

// Composables
import { useSidebarPropertiesPanel } from '../composables/useSidebarPropertiesPanel';

// Constants
import { BASE_DEVICE_KEY } from '../../../../common/constants/devices';

// Utils
import { resolveDeviceIcon } from '../../../../common/utils/bricks/devices';
// #endregion

// #region Emits
const emit = defineEmits<{ close: []; openMediaGallery: [] }>();
// #endregion

// #region Data
const { t } = useI18n();
const canvasStore = useCanvasStore();

/**
 * Tabs of the "Device" row: the base scope first, the overrides after it. The base
 * device writes into the ordinary props of the component while the others write
 * responsive overrides on top of them, so the reverse order would read as "edits on
 * top of nothing". The order deliberately differs from the bottom bar of the canvas,
 * where the row runs from the narrowest device to the widest.
 *
 * Icons only: with four devices the captions do not fit into the strip of the panel,
 * so the name of the device moves into the tooltip.
 */
const deviceScopeItems = computed<IBricksTabItem[]>(() => {
    const devices = canvasStore.devices;
    const base = devices.filter((device) => device.key === BASE_DEVICE_KEY);
    const rest = [...devices].reverse().filter((device) => device.key !== BASE_DEVICE_KEY);

    return [...base, ...rest].map((device) => ({
        value: device.key,
        // The caption is not drawn (iconOnly) but stays the accessible name of the tab
        label: device.label,
        icon: resolveDeviceIcon(device.icon),
        tooltip: `${device.label} · ${device.width}px`,
    }));
});

const {
    store,
    componentEditors,
    componentVariants,
    handleNormalizeProps,
    selectedComponentName,
    selectedComponentDescription,
    orderedPropertyNames,
    hasPropertiesSection,
    showFullWidthControl,
    fullWidthValue,
    isHiddenValue,
    deviceVisibilityValue,
    isResponsiveLayout,
    isResponsiveComponent,
    layoutDeviceScope,
    hasResponsiveOverridesForScope,
    htmlIdValue,
    handleChangeValues,
    handleToggleFullWidth,
    handleToggleHidden,
    handleToggleDeviceVisibility,
    handleSetHtmlId,
    handleOpenMediaGallery,
    handleMediaSelect,
    handleSetLayoutDeviceScope,
    handleResetLayoutDeviceScopeOverrides,
} = useSidebarPropertiesPanel({
    onOpenMediaGallery: () => emit('openMediaGallery'),
});
// #endregion

// #region Methods
/**
 * Closes the properties panel.
 */
function handleClose(): void {
    emit('close');
}

/**
 * Switches the device the responsive properties are edited for.
 *
 * @param value - Value of the picked tab.
 */
function handleSelectDeviceScope(value: string): void {
    const device = canvasStore.devices.find((item) => item.key === value);
    if (!device) {
        return;
    }

    handleSetLayoutDeviceScope(device.key);
}

/**
 * Deletes the selected component.
 */
function handleDelete(): void {
    const selected = store.selectedComponentData;
    if (selected) {
        store.removeComponent(selected.id);
    }
}

// #region Expose
/**
 * Exposed for the parent component to call when media is picked in the gallery.
 */
defineExpose({
    handleMediaSelect,
});
// #endregion
</script>

<template>
    <div :class="$style.BuilderShellSidebarPropertiesView">
        <div :class="$style.header">
            <div :class="$style.headerInfo">
                <h2 :class="$style.title">
                    {{ store?.selectedComponentData ? selectedComponentName : '' }}
                </h2>

                <BricksTooltip v-if="selectedComponentDescription">
                    <template #activator>
                        <div :class="$style.descriptionIcon">
                            <BricksIcon icon="ta:outline-info-circle" />
                        </div>
                    </template>

                    <template #default>
                        <BricksTooltipHint :text="selectedComponentDescription" />
                    </template>
                </BricksTooltip>
            </div>
            <BricksCloseButton @click="handleClose" />
        </div>

        <div v-if="isResponsiveComponent" :class="$style.deviceScope">
            <div :class="$style.deviceScopeHeader">
                <span :class="$style.deviceScopeTitle">{{ t('bricks.properties.device') }}</span>

                <BricksButton
                    v-if="layoutDeviceScope !== 'desktop' && hasResponsiveOverridesForScope"
                    size="sm"
                    variant="ghost"
                    @click="handleResetLayoutDeviceScopeOverrides"
                >
                    {{ t('bricks.properties.reset') }}
                </BricksButton>
            </div>

            <BricksTabBar
                :model-value="layoutDeviceScope"
                :items="deviceScopeItems"
                variant="outline"
                icon-only
                block
                :group-label="t('bricks.properties.device')"
                @update:model-value="handleSelectDeviceScope"
            />
        </div>

        <div :class="[$style.content, 'bricks-scrollbox']">
            <div v-if="hasPropertiesSection" :class="$style.section">
                <BuilderShellSidebarPropertyEditors
                    :key="store.selectedComponent?.id ?? ''"
                    :device-scope="layoutDeviceScope"
                    :component-editors="componentEditors"
                    :component-variants="componentVariants"
                    :ordered-property-names="orderedPropertyNames"
                    :full-width-value="fullWidthValue"
                    :show-full-width-control="showFullWidthControl"
                    :is-hidden-value="isHiddenValue"
                    :device-visibility-value="deviceVisibilityValue"
                    :html-id-value="htmlIdValue"
                    :handle-normalize-props="handleNormalizeProps"
                    :handle-change-values="handleChangeValues"
                    :handle-open-media-gallery="handleOpenMediaGallery"
                    :handle-toggle-full-width="handleToggleFullWidth"
                    :handle-toggle-hidden="handleToggleHidden"
                    :handle-toggle-device-visibility="handleToggleDeviceVisibility"
                    :handle-set-html-id="handleSetHtmlId"
                />
            </div>

            <div :class="$style.actions">
                <BricksButton variant="danger" size="md" block @click="handleDelete">
                    <BricksIcon :class="$style.buttonIcon" icon="ta:outline-circle-x" />
                    <span>{{ t('bricks.common.delete') }}</span>
                </BricksButton>
            </div>
        </div>
    </div>
</template>

<style module lang="scss">
.BuilderShellSidebarPropertiesView {
    overflow-y: auto;
    display: flex;
    flex: 1;
    flex-direction: column;
}

.header {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    padding: 1.6rem 2rem;
    border-bottom: 1px solid var(--bricks-base-200);
}

.headerInfo {
    display: flex;
    align-items: center;
    min-width: 0;
    flex-direction: row;
    gap: 0.6rem;
}

.descriptionIcon,
.title {
    margin: 0;
    font-size: 1.6rem;
    font-weight: 600;
    color: var(--bricks-base-900);
}

.content {
    overflow-y: auto;
    flex: 1;
    padding: 1.4rem 2rem;
}

.section {
    margin-bottom: 2.4rem;
    padding-bottom: 2.4rem;

    &:last-child {
        border-bottom: none;
    }
}

.deviceScope {
    display: flex;
    flex-direction: column;
    gap: 0.8rem;
    padding: 1.2rem 2rem;
    border-bottom: 1px solid var(--bricks-base-200);
}

.deviceScopeHeader {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.8rem;
}

.deviceScopeTitle {
    font-size: 1.2rem;
    font-weight: 600;
    color: var(--bricks-base-700);
}

.actions {
    display: flex;
    flex-direction: column;
    gap: 0.8rem;
    margin-top: 2.4rem;
    padding-top: 2.4rem;
}

.buttonIcon {
    width: 1.8rem;
    height: 1.8rem;
}
</style>
