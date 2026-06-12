// Types
import type { PropertyEditorType } from '../components/property-editors/types';

// Vue
import { defineAsyncComponent, type Component } from 'vue';

/**
 * Мапа «тип свойства → асинхронный компонент-редактор» для панели свойств.
 */
export const componentEditors: Record<PropertyEditorType, Component> = {
    boolean: defineAsyncComponent(() => import('../../../../ui/base/checkbox/BricksCheckbox.vue')),
    switch: defineAsyncComponent(() => import('../../../../ui/inputs/BricksSwitch.vue')),
    select: defineAsyncComponent(() => import('../../../../ui/inputs/BricksSelect.vue')),
    input: defineAsyncComponent(() => import('../../../../ui/inputs/BricksInput.vue')),
    textarea: defineAsyncComponent(
        () => import('../../../../text-editor/components/TextEditorArea.vue')
    ),
    json: defineAsyncComponent(
        () => import('../components/property-editors/BuilderShellSidebarPropertyJsonEditor.vue')
    ),
    'inline-content': defineAsyncComponent(
        () =>
            import(
                '../components/property-editors/BuilderShellSidebarPropertyInlineContentEditor.vue'
            )
    ),
    tags: defineAsyncComponent(() => import('../../../../ui/inputs/BricksTagsEditor.vue')),
    'image-gallery': defineAsyncComponent(
        () =>
            import(
                '../components/property-editors/BuilderShellSidebarPropertyImageGalleryEditor.vue'
            )
    ),
    'accordion-items': defineAsyncComponent(
        () =>
            import(
                '../components/property-editors/BuilderShellSidebarPropertyAccordionItemsEditor.vue'
            )
    ),
    color: defineAsyncComponent(() => import('../../../../ui/inputs/BricksHexInput.vue')),
    image: defineAsyncComponent(
        () => import('../components/property-editors/BuilderShellSidebarPropertyMediaPicker.vue')
    ),
    video: defineAsyncComponent(
        () => import('../components/property-editors/BuilderShellSidebarPropertyMediaPicker.vue')
    ),
};
