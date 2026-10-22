// Types
import type { IBlockCanvasContext, IBlockDefinition, IBlockRenderContext } from '../types/registry';

// Vue
import { h, defineAsyncComponent, type VNode } from 'vue';

// Constants
import { BLOCK_TEXT_BASE_FONT_SIZE, BLOCK_TEXT_LEGACY_FONT_SIZES } from '../constants/blockText';

// Utils
import { bindBoundPropsWithComponentId } from '../utils/canvasBindings';
import { coerceBlockProps } from '../utils/propertyCoercion';
import { hasOwnKey } from '../../common/utils/safeRecord';
import {
    getOverriddenDeviceKeys,
    getResponsiveOverrides,
    gridPlacementStyle,
    hasResponsiveValue,
    makeResponsiveVars,
    toSignedRem,
} from '../utils/responsiveVars';

// Components
// Async import (the blockSlider pattern): the registry is imported by the bricks-styles
// plugin on every page, and a static .vue import would drag the component (and the xss
// sanitizer with it) into the entry bundle of every page of the consumer. The canvas uses
// the eager version out of canvasBlockComponents.ts.
const BlockText = defineAsyncComponent(() => import('./BlockText.vue'));

/**
 * Published render of Text: the canvas component without the editor chrome, so it is
 * rendered directly.
 *
 * @param ctx - Render context of the published page.
 * @returns Text VNode.
 */
function renderTextPublished(ctx: IBlockRenderContext): VNode {
    const { component, definition, extraClasses, extraAttrs, styles } = ctx;
    // Both surfaces used to read the raw schema here — the canvas binds `boundProps`
    // and builds the same variables out of the same untouched object — so neither
    // consulted the descriptor, and a `fontSize` of Infinity set the size of the block
    // to `Infinityrem` in the editor and on the page alike.
    //
    // The RAW props are what gets folded, with nothing laying in defaults before it:
    // the legacy branch of `buildTextFontSizeVars` tells "no fontSize of its own" from
    // "has one" by presence, and a default materialized first would switch that branch
    // off and resize the text of every existing page on narrow devices at once.
    // Coercion itself is safe here — it never adds a property the schema lacks.
    const componentProps = coerceBlockProps(
        definition.properties,
        component.props as Record<string, unknown>
    );
    const style: Record<string, string> = {
        ...gridPlacementStyle(component),
        ...buildTextFontSizeVars(componentProps),
        ...buildTextSpacingVars(componentProps),
    };

    return h(BlockText, {
        ...componentProps,
        key: component.id,
        id: component.htmlId || undefined,
        class: [styles.bricksText, ...extraClasses],
        style,
        // The attribute is mandatory: it is what the generated rule that selects the
        // per-device font size matches on (`[data-bricks-layout="text"]`)
        'data-bricks-layout': 'text',
        ...extraAttrs,
    });
}

/**
 * Computes the per-device font size variables of Text.
 *
 * Older schemas have no `fontSize` property at all, and their size came from
 * `@container` queries in the SFC. Simply taking the base value is not an option — all
 * existing text would get larger on narrow devices. So a schema without a `fontSize` of
 * its own gets the former sizes under the canonical keys of
 * `BLOCK_TEXT_LEGACY_FONT_SIZES`, and anything missing from that table (a new
 * intermediate device) inherits the base size.
 *
 * @param props - Block props coerced against the property definitions, `responsive`
 *   included. Coerced rather than raw: the size is picked by the generated rule keyed
 *   on the variable, so an unfolded value would set the size of the block on both
 *   surfaces at once, past the bounds its own definition declares.
 * @returns CSS variables of the font size.
 */
function buildTextFontSizeVars(props: Record<string, unknown>): Record<string, string> {
    const hasOwnFontSize = props.fontSize !== undefined;
    const base = Number(props.fontSize) || BLOCK_TEXT_BASE_FONT_SIZE;

    const vars: Record<string, string> = { '--bricks-text-font-size-base': `${base}rem` };

    if (!hasOwnFontSize) {
        for (const [key, size] of Object.entries(BLOCK_TEXT_LEGACY_FONT_SIZES)) {
            vars[`--bricks-text-font-size-${key}`] = `${size}rem`;
        }

        return vars;
    }

    for (const device of getOverriddenDeviceKeys(props)) {
        const overrides = getResponsiveOverrides(props, device);

        // Explicit overrides only: a device that overrides something else has to
        // inherit the base size through the CSS fallback rather than get a copy of the
        // base value in its own variable
        if (!hasOwnKey(overrides, 'fontSize')) {
            continue;
        }

        const value = Number(overrides.fontSize);

        if (Number.isFinite(value) && value > 0) {
            vars[`--bricks-text-font-size-${device}`] = `${value}rem`;
        }
    }

    return vars;
}

/**
 * Computes the per-device margin variables of Text.
 *
 * The margins live in variables rather than in the props of the component for the same
 * reason the font size does: the value of the device is picked by the generated CSS
 * rule, one rule for the canvas sheet and one for the width of the published page, so
 * both surfaces read one table instead of each folding the overrides on its own.
 *
 * @param props - Block props coerced against the property definitions, `responsive`
 *   included.
 * @returns CSS variables of the margins.
 */
function buildTextSpacingVars(props: Record<string, unknown>): Record<string, string> {
    const vars: Record<string, string> = {};

    // A margin of zero needs no variable at all: the component falls back to `0rem` on
    // its own, and a table emitted for every block of every page would be bytes paid
    // for a value nobody set
    if (hasResponsiveValue(props, 'marginTop', props.marginTop)) {
        Object.assign(
            vars,
            makeResponsiveVars('--bricks-text-mt', props.marginTop, props, 'marginTop', toSignedRem)
        );
    }

    if (hasResponsiveValue(props, 'marginBottom', props.marginBottom)) {
        Object.assign(
            vars,
            makeResponsiveVars(
                '--bricks-text-mb',
                props.marginBottom,
                props,
                'marginBottom',
                toSignedRem
            )
        );
    }

    return vars;
}

/**
 * Canvas binding of Text: the block props plus the same per-device variables the
 * published render gets.
 *
 * The variables are needed on the canvas too: the size is chosen by the generated rule
 * keyed on `data-bricks-viewport`, not by the prop. Otherwise a legacy schema without a
 * `fontSize` of its own would show the base size on the canvas even though it used to be
 * smaller on a narrow sheet — and the builder would disagree with the published page
 * again, only the other way round.
 *
 * @param ctx - Canvas binding context.
 * @param coercedProps - Block props folded against the property definitions.
 * @returns Props of the canvas component.
 */
function bindTextCanvas(
    ctx: IBlockCanvasContext,
    coercedProps: Record<string, unknown>
): Record<string, unknown> {
    return {
        ...bindBoundPropsWithComponentId(ctx),
        style: { ...buildTextFontSizeVars(coercedProps), ...buildTextSpacingVars(coercedProps) },
        'data-bricks-layout': 'text',
    };
}

/**
 * Definition of the Text block: HTML text.
 *
 * The structural default of `content` is empty, and the starting text arrives through
 * `seedProps`: a default travels into the page schema on the first save and from that
 * moment belongs to the person editing, not to the interface. An empty block would be
 * next to impossible to hit with the cursor, which is why the seed is not simply
 * dropped.
 */
export const blockTextDefinition: IBlockDefinition = {
    name: 'Text',
    description: 'bricks.blocks.text.description',
    thumbnail: 'images/layouts/text.svg',
    responsiveMode: 'all',
    responsiveCssVars: {
        prefix: 'text',
        vars: ['font-size', 'mt', 'mb'],
    },
    canvasBind: bindTextCanvas,
    renderPublished: renderTextPublished,
    seedProps: (translate) => ({
        content: `<p>${translate('bricks.blocks.text.defaultContent')}</p>`,
    }),
    properties: [
        {
            name: 'content',
            type: 'textarea',
            label: 'bricks.blocks.text.props.content.label',
            default: '',
        },
        {
            name: 'fontSize',
            type: 'number',
            label: 'bricks.blocks.text.props.fontSize.label',
            default: BLOCK_TEXT_BASE_FONT_SIZE,
            min: 0.8,
            step: 0.2,
            unit: 'rem',
            responsive: true,
        },
        {
            name: 'marginTop',
            responsive: true,
            type: 'number',
            label: 'bricks.blocks.text.props.marginTop.label',
            default: 0,
            step: 0.2,
            unit: 'rem',
            group: 'bricks.blocks.text.groups.spacing',
        },
        {
            name: 'marginBottom',
            responsive: true,
            type: 'number',
            label: 'bricks.blocks.text.props.marginBottom.label',
            default: 0,
            step: 0.2,
            unit: 'rem',
            group: 'bricks.blocks.text.groups.spacing',
        },
    ],
};
