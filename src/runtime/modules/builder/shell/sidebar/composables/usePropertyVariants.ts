// #region Imports
// Types
import type { ISelectedComponentData, IUsePropertyVariantsReturn } from '../types/composables';
import type { IPropertyDefinition } from '../../../../common/types/brick';

// Vue
import { computed, type ComputedRef } from 'vue';
import { useI18n } from 'vue-i18n';

// Utils
import { readOwnKey } from '../../../../common/utils/safeRecord';
import { resolveBricksLabel } from '../../../../common/utils/i18nLabels';
import { normalizeVariantProps } from '../utils/normalizeVariantProps';
import {
    VARIANT_BUILDERS,
    buildInputVariant,
    buildSelectVariant,
    createEmptyVariants,
    type IVariantBuilderTools,
} from '../utils/variantBuilders';

// Constants
import {
    PROPERTY_EDITOR_ORDER,
    type TComponentVariantsMap,
    type IComponentVariant,
    type IPropertyVariantContext,
    type TPropertyEditorType,
} from '../components/property-editors/types';
// #endregion

/**
 * Variants of the component properties. Turns the property definitions into the
 * variants of the various editor types through the `VARIANT_BUILDERS` registry
 * (utils/variantBuilders.ts).
 *
 * @param selectedComponentData - Computed data of the selected component.
 * @returns The property variants and the props normalizer.
 */
export function usePropertyVariants(
    selectedComponentData: ComputedRef<ISelectedComponentData | null>
): IUsePropertyVariantsReturn {
    const { t, te } = useI18n();

    const builderTools: IVariantBuilderTools = {
        resolveLabel: (property) => resolveBricksLabel(t, te, property.label) || property.name,
        t,
    };

    // #region Computed
    /**
     * Property variants of every editor type
     */
    const componentVariants = computed<TComponentVariantsMap>(() => {
        const selected = selectedComponentData.value;
        if (!selected) {
            return createEmptyVariants(PROPERTY_EDITOR_ORDER);
        }

        const variants = createEmptyVariants(PROPERTY_EDITOR_ORDER);

        selected.properties.forEach((property) => {
            if (property.type === 'readonly') {
                return;
            }

            /* Inline content is edited right on the canvas (a double click on the block)
               and has no editor in the panel. Without this filter the property would
               reach the fallback input and show the user an array of segments as a
               string. */
            if (property.type === 'inline-content') {
                return;
            }
            try {
                addVariantForProperty({
                    property,
                    componentProps: selected.component.props,
                    variants,
                });
            } catch (error) {
                console.error('[usePropertyVariants] Error processing property:', property, error);
            }
        });

        return variants;
    });
    // #endregion

    // #region Methods
    /**
     * Adds the variant of a property to the collection it belongs to. Dispatch order:
     * boolean → the select heuristic (two or more options) → the registry by type →
     * the input fallback.
     *
     * @param context - Context holding the property and the variants.
     */
    function addVariantForProperty(context: IPropertyVariantContext): void {
        if (!shouldRenderProperty(context.property, context.componentProps)) {
            return;
        }

        const builder = VARIANT_BUILDERS[context.property.type];

        if (context.property.type === 'boolean' && builder) {
            builder(context, builderTools);
            return;
        }

        const resolveOptionLabel = (label: string): string =>
            resolveBricksLabel(t, te, label) ?? label;
        if (buildSelectVariant(context, builderTools, resolveOptionLabel)) {
            return;
        }

        if (builder) {
            builder(context, builderTools);
            return;
        }

        buildInputVariant(context, builderTools);
    }

    /**
     * Checks the condition under which the property is shown in the panel.
     *
     * The name of the field is declared by a brick file: without the own-key check a
     * `showWhen.field` of `constructor` would return a prototype member, the
     * comparison against `equals` would be false for any schema, and the property
     * would silently vanish from the panel.
     */
    function shouldRenderProperty(
        property: IPropertyDefinition,
        componentProps: Record<string, unknown>
    ): boolean {
        const showWhen = property.showWhen;
        if (!showWhen) {
            return true;
        }

        return readOwnKey(componentProps, showWhen.field) === showWhen.equals;
    }

    /**
     * Normalizes the props handed over to the editor components.
     *
     * @param data - Data of the property variant.
     * @param _editorType - Editor type, part of the contract and unused here.
     * @returns Normalized props object.
     */
    function handleNormalizeProps(
        data: IComponentVariant,
        _editorType: TPropertyEditorType
    ): Record<string, unknown> {
        return normalizeVariantProps(data);
    }
    // #endregion

    return {
        componentVariants,
        handleNormalizeProps,
    };
}
