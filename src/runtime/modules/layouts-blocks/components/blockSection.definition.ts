// Types
import type { ISectionLayoutProps } from '../types/blockProps';
import type { IBlockDefinition, IBlockRenderContext } from '../types/registry';

// Vue
import { h, type VNode } from 'vue';

// Utils
import { bindLayoutContainer } from '../utils/canvasBindings';
import { coerceBlockProps } from '../utils/propertyCoercion';
import {
    gridPlacementStyle,
    hasResponsiveValue,
    makeResponsiveVars,
    toRem,
} from '../utils/responsiveVars';
import {
    hasSectionContentLimit,
    sectionLayoutStyle,
    toSectionMaxWidth,
} from '../utils/sectionContentWidth';

/**
 * The background color as a CSS value. An empty one means "no background of its own",
 * and on a device it is a deliberate reset of the color of the base one.
 *
 * @param value - The value of the property.
 * @returns A CSS color.
 */
function toBackgroundColor(value: unknown): string {
    return String(value || 'transparent');
}

/**
 * The background image as a CSS value: an empty one is `none`, for the same reason an
 * empty color is `transparent`.
 *
 * @param value - The value of the property.
 * @returns A CSS `background-image`.
 */
function toBackgroundImage(value: unknown): string {
    return value ? `url(${String(value)})` : 'none';
}

/**
 * Published render of Section: an `h('div')` with the per-device CSS variables (the
 * canvas BlockSection carries the editor chrome and is not used on a published page).
 *
 * @param ctx - Render context of the published page.
 * @returns VNode of the section component.
 */
function renderSectionPublished(ctx: IBlockRenderContext): VNode {
    const { component, definition, extraClasses, extraAttrs, styles } = ctx;
    const { renderChild, getChildComponents } = ctx;
    // The canvas binds the props the registry resolved, and those are coerced against
    // the property definitions; the published render read the raw schema. The two
    // disagreed on every value the descriptor rejects: a padding of Infinity left the
    // page as `Infinityrem` and a non-numeric one collapsed it to zero, while the
    // editor had long since shown the declared default of 4.
    const props = coerceBlockProps(
        definition.properties,
        component.props as Record<string, unknown>
    );
    const cp = props as ISectionLayoutProps;
    // The limit of the content width enters the markup only when some device sets one,
    // so a section that never had it renders exactly as before the property existed.
    // A nested section without a limit of its own still inherits the variable of an
    // outer one, which is harmless: its layout does not read it
    const hasContentLimit = hasSectionContentLimit(props);

    const style: Record<string, string> = {
        ...sectionLayoutStyle(hasContentLimit ? 'var(--bricks-section-max-w)' : null),
        width: '100%',
        padding: 'var(--bricks-section-pt) var(--bricks-section-px) var(--bricks-section-pb)',
        borderRadius: 'var(--bricks-section-radius)',
        minHeight: 'var(--bricks-section-min-h)',
        ...makeResponsiveVars('--bricks-section-pt', cp.paddingTop, props, 'paddingTop', toRem),
        ...makeResponsiveVars(
            '--bricks-section-pb',
            cp.paddingBottom,
            props,
            'paddingBottom',
            toRem
        ),
        ...makeResponsiveVars('--bricks-section-px', cp.paddingX, props, 'paddingX', toRem),
        ...makeResponsiveVars(
            '--bricks-section-radius',
            cp.borderRadius,
            props,
            'borderRadius',
            toRem
        ),
        ...makeResponsiveVars('--bricks-section-min-h', cp.minHeight, props, 'minHeight', toRem),
    };

    if (hasContentLimit) {
        Object.assign(
            style,
            makeResponsiveVars(
                '--bricks-section-max-w',
                cp.maxWidth,
                props,
                'maxWidth',
                toSectionMaxWidth
            )
        );
    }

    // The declaration appears only when a background exists somewhere — on the base
    // device or on any other. A section that never had one must not emit
    // `background-color: transparent`: an inline declaration beats the stylesheet of a
    // consumer painting the section from the outside. Once it does appear, it appears
    // for every device, and that is what lets a device clear the background of the base
    // one: an empty override becomes `transparent` instead of falling back into it
    if (hasResponsiveValue(props, 'backgroundColor', cp.backgroundColor)) {
        style.backgroundColor = 'var(--bricks-section-bg-color)';
        Object.assign(
            style,
            makeResponsiveVars(
                '--bricks-section-bg-color',
                cp.backgroundColor,
                props,
                'backgroundColor',
                toBackgroundColor
            )
        );
    }

    if (hasResponsiveValue(props, 'backgroundImage', cp.backgroundImage)) {
        style.backgroundImage = 'var(--bricks-section-bg-image)';
        style.backgroundSize = 'cover';
        style.backgroundPosition = 'center';
        Object.assign(
            style,
            makeResponsiveVars(
                '--bricks-section-bg-image',
                cp.backgroundImage,
                props,
                'backgroundImage',
                toBackgroundImage
            )
        );
    }

    Object.assign(style, gridPlacementStyle(component));

    const childComponents = getChildComponents(component);

    return h(
        'div',
        {
            id: component.htmlId || undefined,
            style,
            class: [styles.bricksSection, ...extraClasses],
            'data-bricks-layout': 'section',
            ...extraAttrs,
        },
        childComponents.map((child) => renderChild(child))
    );
}

/**
 * Definition of the Section block: a wrapper section with a background, children in
 * the default slot.
 */
export const blockSectionDefinition: IBlockDefinition = {
    name: 'Section',
    description: 'bricks.blocks.section.description',
    thumbnail: 'images/layouts/section.svg',
    hasChildren: true,
    responsiveMode: 'all',
    responsiveCssVars: {
        prefix: 'section',
        vars: ['pt', 'pb', 'px', 'max-w', 'radius', 'min-h', 'bg-color', 'bg-image'],
    },
    // The default binding plus the layout model: the canvas resolves the props of the
    // device it draws, while the model depends on the limits of every device
    canvasBind: (ctx, coercedProps) => ({
        ...bindLayoutContainer(ctx, 'Section'),
        hasContentLimit: hasSectionContentLimit(coercedProps),
    }),
    renderPublished: renderSectionPublished,
    properties: [
        {
            name: 'backgroundColor',
            responsive: true,
            type: 'color',
            label: 'bricks.blocks.section.props.backgroundColor.label',
            default: '',
            description: 'bricks.blocks.section.props.backgroundColor.description',
            group: 'bricks.blocks.section.groups.background',
        },
        {
            name: 'backgroundImage',
            responsive: true,
            type: 'image',
            label: 'bricks.blocks.section.props.backgroundImage.label',
            default: '',
            description: 'bricks.blocks.section.props.backgroundImage.description',
            group: 'bricks.blocks.section.groups.background',
        },
        {
            name: 'paddingTop',
            type: 'number',
            label: 'bricks.blocks.section.props.paddingTop.label',
            default: 4,
            min: 0,
            step: 0.2,
            unit: 'rem',
            group: 'bricks.blocks.section.groups.spacing',
            responsive: true,
        },
        {
            name: 'paddingBottom',
            type: 'number',
            label: 'bricks.blocks.section.props.paddingBottom.label',
            default: 4,
            min: 0,
            step: 0.2,
            unit: 'rem',
            group: 'bricks.blocks.section.groups.spacing',
            responsive: true,
        },
        {
            name: 'paddingX',
            type: 'number',
            label: 'bricks.blocks.section.props.paddingX.label',
            default: 0,
            min: 0,
            step: 0.2,
            unit: 'rem',
            group: 'bricks.blocks.section.groups.spacing',
            responsive: true,
        },
        {
            name: 'borderRadius',
            type: 'number',
            label: 'bricks.blocks.section.props.borderRadius.label',
            default: 0,
            min: 0,
            step: 0.2,
            responsive: true,
        },
        {
            name: 'minHeight',
            type: 'number',
            label: 'bricks.blocks.section.props.minHeight.label',
            default: 0,
            min: 0,
            step: 0.2,
            description: 'bricks.blocks.section.props.minHeight.description',
            responsive: true,
        },
        {
            name: 'maxWidth',
            type: 'number',
            label: 'bricks.blocks.section.props.maxWidth.label',
            default: 0,
            min: 0,
            step: 0.2,
            unit: 'rem',
            description: 'bricks.blocks.section.props.maxWidth.description',
            responsive: true,
        },
    ],
};
