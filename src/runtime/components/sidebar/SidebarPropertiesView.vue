<script setup lang="ts">
// #region Imports
// Components
import BricksButton from '../ui/base/button/BricksButton.vue';
import BricksCloseButton from '../ui/base/modal/BricksCloseButton.vue';
import SidebarPropertyEditors from './SidebarPropertyEditors.vue';
import BricksTooltip from '../ui/tooltip/BricksTooltip.vue';
import BricksTooltipHint from '../ui/tooltip/BricksTooltipHint.vue';

// Composables
import { useSidebarPropertiesPanel } from '../../composables/useSidebarPropertiesPanel';
// #endregion

// #region Emits
const emit = defineEmits<{ close: []; openMediaGallery: [] }>();
// #endregion

// #region Data
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
 * Закрывает панель свойств
 */
function handleClose(): void {
    emit('close');
}

/**
 * Удаляет выбранный компонент
 */
function handleDelete(): void {
    const selected = store.selectedComponentData;
    if (selected) {
        store.removeComponent(selected.id);
    }
}

// #region Expose
/**
 * Expose метод для вызова из родительского компонента при выборе медиа из галереи
 */
defineExpose({
    handleMediaSelect,
});
// #endregion
</script>

<template>
    <div :class="$style.SidebarPropertiesView">
        <div :class="$style.header">
            <div :class="$style.headerInfo">
                <h2 :class="$style.title">
                    {{ store?.selectedComponentData ? selectedComponentName : '' }}
                </h2>

                <BricksTooltip v-if="selectedComponentDescription" bottom>
                    <template #activator>
                        <div :class="$style.descriptionIcon">
                            <BricksLandIcon icon="ph:info" />
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
                <span :class="$style.deviceScopeTitle">Устройство</span>

                <BricksButton
                    v-if="layoutDeviceScope !== 'desktop' && hasResponsiveOverridesForScope"
                    size="sm"
                    variant="ghost"
                    @click="handleResetLayoutDeviceScopeOverrides"
                >
                    Сбросить
                </BricksButton>
            </div>

            <div :class="$style.deviceScopeButtons">
                <BricksButton
                    size="sm"
                    variant="secondary"
                    :active="layoutDeviceScope === 'desktop'"
                    @click="handleSetLayoutDeviceScope('desktop')"
                >
                    Desktop
                </BricksButton>

                <BricksButton
                    size="sm"
                    variant="secondary"
                    :active="layoutDeviceScope === 'tablet'"
                    @click="handleSetLayoutDeviceScope('tablet')"
                >
                    Tablet
                </BricksButton>

                <BricksButton
                    size="sm"
                    variant="secondary"
                    :active="layoutDeviceScope === 'mobile'"
                    @click="handleSetLayoutDeviceScope('mobile')"
                >
                    Mobile
                </BricksButton>
            </div>
        </div>

        <div :class="[$style.content, 'scrollbox']">
            <div v-if="!store.selectedComponentData" :class="$style.debug">
                <p>No component selected</p>
                <p>selectedComponent: {{ store.selectedComponent }}</p>
                <p>selectedComponentData: {{ store.selectedComponentData }}</p>
            </div>

            <div v-if="hasPropertiesSection" :class="$style.section">
                <SidebarPropertyEditors
                    :key="store.selectedComponent?.id ?? ''"
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
                    <BricksLandIcon :class="$style.buttonIcon" icon="ti:outline-delete" />
                    <span>Удалить</span>
                </BricksButton>
            </div>
        </div>
    </div>
</template>

<style module lang="scss">
.SidebarPropertiesView {
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
    border-bottom: 1px solid var(--land-base-300);
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
    color: var(--land-base-900);
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
    border-bottom: 1px solid var(--land-base-300);
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
    color: var(--land-base-700);
}

.deviceScopeButtons {
    display: flex;
    gap: 0.8rem;
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

.debug {
    margin: 1rem 0;
    padding: 2rem;
    border: 1px solid var(--land-base-300);
    background-color: var(--land-base-300);

    p {
        margin: 0.6rem 0;
        font-size: 1.2rem;
    }
}
</style>
