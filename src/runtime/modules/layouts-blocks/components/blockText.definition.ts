// Types
import type { IBlockCanvasContext, IBlockDefinition, IBlockRenderContext } from '../types/registry';

// Vue
import { h, defineAsyncComponent, type VNode } from 'vue';

// Constants
import { BLOCK_TEXT_BASE_FONT_SIZE, BLOCK_TEXT_LEGACY_FONT_SIZES } from '../constants/blockText';

// Utils
import { bindBoundPropsWithComponentId } from '../utils/canvasBindings';
import { hasOwnKey } from '../../common/utils/safeRecord';
import {
    getOverriddenDeviceKeys,
    getResponsiveOverrides,
    gridPlacementStyle,
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
    const { component, extraClasses, extraAttrs, styles } = ctx;
    const componentProps = component.props as Record<string, unknown>;
    const style: Record<string, string> = {
        ...gridPlacementStyle(component),
        ...buildTextFontSizeVars(componentProps),
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
 * @param props - Block props.
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
 * @returns Props of the canvas component.
 */
function bindTextCanvas(ctx: IBlockCanvasContext): Record<string, unknown> {
    return {
        ...bindBoundPropsWithComponentId(ctx),
        style: buildTextFontSizeVars(ctx.component.props as Record<string, unknown>),
        'data-bricks-layout': 'text',
    };
}

/**
 * Definition of the Text block: HTML text.
 * The `content` default is a Russian string, matching what block creation has always
 * produced; it is UI text still awaiting i18n.
 */
export const blockTextDefinition: IBlockDefinition = {
    name: 'Text',
    description: 'bricks.blocks.text.description',
    thumbnail: 'images/layouts/text.svg',
    responsiveMode: 'all',
    responsiveCssVars: {
        prefix: 'text',
        vars: ['font-size'],
    },
    canvasBind: bindTextCanvas,
    renderPublished: renderTextPublished,
    properties: [
        {
            name: 'content',
            type: 'textarea',
            label: 'bricks.blocks.text.props.content.label',
            default: '<p>Введите текст</p>',
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
            type: 'number',
            label: 'bricks.blocks.text.props.marginTop.label',
            default: 0,
            step: 0.2,
            unit: 'rem',
            group: 'bricks.blocks.text.groups.spacing',
        },
        {
            name: 'marginBottom',
            type: 'number',
            label: 'bricks.blocks.text.props.marginBottom.label',
            default: 0,
            step: 0.2,
            unit: 'rem',
            group: 'bricks.blocks.text.groups.spacing',
        },
    ],
};
