// Types
import type { ISectionLayoutProps } from '../types/blockProps';
import type { IBlockDefinition, IBlockRenderContext } from '../types/registry';

// Vue
import { h, type VNode } from 'vue';

// Utils
import {
    getResponsiveOverrides,
    gridPlacementStyle,
    makeResponsiveVars,
    toRem,
} from '../utils/responsiveVars';

/**
 * Published-рендер Section: `h('div')` с per-device CSS-переменными
 * (канвасный BlockSection несёт editor chrome и на published не используется).
 *
 * @param ctx - Контекст рендера published-страницы.
 * @returns VNode section-компонента.
 */
function renderSectionPublished(ctx: IBlockRenderContext): VNode {
    const { component, extraClasses, extraAttrs, styles, renderChild, getChildComponents } = ctx;
    const cp = component.props as ISectionLayoutProps;
    const mOv = getResponsiveOverrides(cp as Record<string, unknown>, 'mobile');
    const tOv = getResponsiveOverrides(cp as Record<string, unknown>, 'tablet');

    const style: Record<string, string> = {
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        padding: 'var(--bricks-section-pt) var(--bricks-section-px) var(--bricks-section-pb)',
        borderRadius: 'var(--bricks-section-radius)',
        minHeight: 'var(--bricks-section-min-h)',
        ...makeResponsiveVars('--bricks-section-pt', cp.paddingTop, tOv, mOv, 'paddingTop', toRem),
        ...makeResponsiveVars(
            '--bricks-section-pb',
            cp.paddingBottom,
            tOv,
            mOv,
            'paddingBottom',
            toRem
        ),
        ...makeResponsiveVars('--bricks-section-px', cp.paddingX, tOv, mOv, 'paddingX', toRem),
        ...makeResponsiveVars(
            '--bricks-section-radius',
            cp.borderRadius,
            tOv,
            mOv,
            'borderRadius',
            toRem
        ),
        ...makeResponsiveVars('--bricks-section-min-h', cp.minHeight, tOv, mOv, 'minHeight', toRem),
    };

    if (cp.backgroundColor) {
        style.backgroundColor = cp.backgroundColor;
    }

    if (cp.backgroundImage) {
        style.backgroundImage = `url(${cp.backgroundImage})`;
        style.backgroundSize = 'cover';
        style.backgroundPosition = 'center';
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
 * Definition блока Section: секция-обёртка с фоном, children в default slot.
 */
export const blockSectionDefinition: IBlockDefinition = {
    name: 'Section',
    description: 'bricks.blocks.section.description',
    thumbnail: 'images/layouts/section.svg',
    hasChildren: true,
    responsiveMode: 'all',
    responsiveCssVars: {
        prefix: 'section',
        vars: ['pt', 'pb', 'px', 'radius', 'min-h'],
    },
    renderPublished: renderSectionPublished,
    properties: [
        {
            name: 'backgroundColor',
            type: 'color',
            label: 'bricks.blocks.section.props.backgroundColor.label',
            default: '',
            description: 'bricks.blocks.section.props.backgroundColor.description',
            group: 'bricks.blocks.section.groups.background',
        },
        {
            name: 'backgroundImage',
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
    ],
};
