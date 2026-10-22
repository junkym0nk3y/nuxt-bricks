// #region Imports
// Vitest
import { describe, expect, it } from 'vitest';

// Types
import type { IPropertyDefinition } from '../../src/runtime/modules/common/types/brick';

// Utils
import {
    VARIANT_BUILDERS,
    createEmptyVariants,
    type IVariantBuilderTools,
} from '../../src/runtime/modules/builder/shell/sidebar/utils/variantBuilders';
import { parseSliderCaptions } from '../../src/runtime/modules/layouts-blocks/utils/sliderCaptions';

// Constants
import {
    PROPERTY_EDITOR_ORDER,
    type IPropertyVariantContext,
} from '../../src/runtime/modules/builder/shell/sidebar/components/property-editors/types';
import { blockSliderDefinition } from '../../src/runtime/modules/layouts-blocks/components/blockSlider.definition';
// #endregion

/**
 * The slider captions used to be a `textarea` property, and `textarea` is the rich-text
 * editor: the JSON typed into it was saved as `<p>[...]</p>`, failed to parse and no
 * caption tab ever rendered. The property now goes to the json editor, which saves the
 * array itself.
 */

const TOOLS: IVariantBuilderTools = {
    resolveLabel: (property) => property.label || property.name,
    t: (key) => key,
};

/**
 * The captions property as the Slider definition declares it.
 *
 * @returns Definition of the property.
 */
function getCaptionsProperty(): IPropertyDefinition {
    const property = blockSliderDefinition.properties.find((item) => item.name === 'captions');
    if (!property) {
        throw new Error('Slider definition has no captions property');
    }
    return property as IPropertyDefinition;
}

/**
 * Runs the variant builder of the captions property over the given props.
 *
 * @param componentProps - Props of the slider out of the schema.
 * @returns The variants the panel would render.
 */
function buildCaptionsVariants(
    componentProps: Record<string, unknown>
): IPropertyVariantContext['variants'] {
    const property = getCaptionsProperty();
    const context: IPropertyVariantContext = {
        property,
        componentProps,
        variants: createEmptyVariants(PROPERTY_EDITOR_ORDER),
    };

    VARIANT_BUILDERS[property.type]?.(context, TOOLS);

    return context.variants;
}

describe('slider captions property', () => {
    it('is edited in the json editor rather than in the rich-text one', () => {
        const variants = buildCaptionsVariants({});

        expect(variants.textarea).toHaveLength(0);
        expect(variants.input).toHaveLength(0);
        expect(variants.json).toHaveLength(1);
        expect(variants.json[0].value).toEqual([]);
    });

    it('shows a value saved as a JSON string as the list it stands for', () => {
        const variants = buildCaptionsVariants({ captions: '[{"text":"Summer"}]' });

        expect(variants.json[0].value).toEqual([{ text: 'Summer' }]);
    });

    it('keeps a string that is not JSON as is', () => {
        const variants = buildCaptionsVariants({ captions: '<p>broken</p>' });

        expect(variants.json[0].value).toBe('<p>broken</p>');
    });

    it('turns the array the json editor saves into caption tabs', () => {
        const saved = [{ text: 'Summer', subtitle: 'June' }, { text: 'Autumn' }];

        expect(parseSliderCaptions(saved)).toEqual(saved);
    });
});
