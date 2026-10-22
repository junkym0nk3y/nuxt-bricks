// Types
import type { TPropertyEditorType } from '../components/property-editors/types';

// Vue
import { defineAsyncComponent, type Component } from 'vue';

// Components
import BricksCheckbox from '../../../../ui/base/checkbox/BricksCheckbox.vue';
import BricksHexInput from '../../../../ui/inputs/BricksHexInput.vue';
import BricksSelect from '../../../../ui/inputs/BricksSelect.vue';

/**
 * Map of "property type → editor component" for the properties panel.
 *
 * Three of them are imported statically while the rest are lazy, and that is not an
 * oversight: the checkbox, the select and the hex input are ALSO imported statically
 * by the publish view, the users modal, the media panels, the canvas context menu and
 * the link modal of the text editor. A component that is both static and dynamic gets
 * no code splitting — the bundler inlines it into every chunk that asks statically,
 * so the lazy import here bought nothing and cost a duplicate. None of the static
 * importers lives outside the builder, so the entry graph does not gain anything by
 * this either.
 */
export const componentEditors: Record<TPropertyEditorType, Component> = {
    boolean: BricksCheckbox,
    switch: defineAsyncComponent(() => import('../../../../ui/inputs/BricksSwitch.vue')),
    select: BricksSelect,
    input: defineAsyncComponent(() => import('../../../../ui/inputs/BricksInput.vue')),
    textarea: defineAsyncComponent(
        () => import('../../../../text-editor/components/TextEditorArea.vue')
    ),
    json: defineAsyncComponent(
        () => import('../components/property-editors/BuilderShellSidebarPropertyJsonEditor.vue')
    ),
    tags: defineAsyncComponent(() => import('../../../../ui/inputs/BricksTagsEditor.vue')),
    'image-gallery': defineAsyncComponent(
        () =>
            import('../components/property-editors/BuilderShellSidebarPropertyImageGalleryEditor.vue')
    ),
    'accordion-items': defineAsyncComponent(
        () =>
            import('../components/property-editors/BuilderShellSidebarPropertyAccordionItemsEditor.vue')
    ),
    color: BricksHexInput,
    image: defineAsyncComponent(
        () => import('../components/property-editors/BuilderShellSidebarPropertyMediaPicker.vue')
    ),
    video: defineAsyncComponent(
        () => import('../components/property-editors/BuilderShellSidebarPropertyMediaPicker.vue')
    ),
};
