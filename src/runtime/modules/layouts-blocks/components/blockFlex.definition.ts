// Types
import type { IBlockDefinition, IBlockRenderContext } from '../types/registry';

// Vue
import { h, type VNode } from 'vue';

// Utils
import { convertPxToRem } from '../../common/utils/main';
import {
    getResponsiveOverrides,
    gridPlacementStyle,
    resolveResponsiveValue,
} from '../utils/responsiveVars';

const FLEX_JUSTIFY_CSS: Record<string, string> = {
    start: 'flex-start',
    center: 'center',
    end: 'flex-end',
    'space-between': 'space-between',
    'space-around': 'space-around',
};

const FLEX_ALIGN_CSS: Record<string, string> = {
    stretch: 'stretch',
    start: 'flex-start',
    center: 'center',
    end: 'flex-end',
    baseline: 'baseline',
};

/**
 * Маппит значение justify ('start', 'center', 'end', 'space-between', 'space-around')
 * в CSS flex justify-content.
 *
 * @param justify - Значение выравнивания из пропсов (тип не гарантирован схемой).
 * @returns CSS-значение для justify-content.
 */
function mapFlexJustify(justify?: unknown): string {
    return FLEX_JUSTIFY_CSS[String(justify)] ?? 'flex-start';
}

/**
 * Маппит значение align ('stretch', 'start', 'center', 'end', 'baseline')
 * в CSS flex align-items.
 *
 * @param align - Значение выравнивания из пропсов (тип не гарантирован схемой).
 * @returns CSS-значение для align-items.
 */
function mapFlexAlign(align?: unknown): string {
    return FLEX_ALIGN_CSS[String(align)] ?? 'stretch';
}

/**
 * Published-рендер Flex: `h('div')` с per-device CSS-переменными
 * (канвасный BlockFlex несёт editor chrome и на published не используется).
 *
 * @param ctx - Контекст рендера published-страницы.
 * @returns VNode flex-компонента.
 */
function renderFlexPublished(ctx: IBlockRenderContext): VNode {
    const { component, extraClasses, extraAttrs, styles, renderChild, getChildComponents } = ctx;
    const currentProps = component.props as Record<string, unknown>;

    const baseDirection = String(currentProps.direction || 'row');
    const baseJustify = mapFlexJustify(currentProps.justify);
    const baseGap = Math.max(0, Number(currentProps.gap || 24));

    const mobileOverrides = getResponsiveOverrides(currentProps, 'mobile');
    const tabletOverrides = getResponsiveOverrides(currentProps, 'tablet');

    const directionMobile = String(
        resolveResponsiveValue(baseDirection, mobileOverrides, 'direction')
    );
    const directionTablet = String(
        resolveResponsiveValue(baseDirection, tabletOverrides, 'direction')
    );
    const directionDesktop = baseDirection;

    const justifyMobile = mapFlexJustify(
        resolveResponsiveValue(currentProps.justify, mobileOverrides, 'justify')
    );
    const justifyTablet = mapFlexJustify(
        resolveResponsiveValue(currentProps.justify, tabletOverrides, 'justify')
    );
    const justifyDesktop = baseJustify;

    const wrapMobileRaw = resolveResponsiveValue(
        Boolean(currentProps.wrap),
        mobileOverrides,
        'wrap'
    );
    const wrapTabletRaw = resolveResponsiveValue(
        Boolean(currentProps.wrap),
        tabletOverrides,
        'wrap'
    );
    const wrapDesktopRaw = Boolean(currentProps.wrap);

    const wrapMobile = wrapMobileRaw ? 'wrap' : 'nowrap';
    const wrapTablet = wrapTabletRaw ? 'wrap' : 'nowrap';
    const wrapDesktop = wrapDesktopRaw ? 'wrap' : 'nowrap';

    const gapMobile = Math.max(
        0,
        Number(resolveResponsiveValue(baseGap, mobileOverrides, 'gap')) || baseGap
    );
    const gapTablet = Math.max(
        0,
        Number(resolveResponsiveValue(baseGap, tabletOverrides, 'gap')) || baseGap
    );
    const gapDesktop = baseGap;

    const style = {
        display: 'flex',
        flexDirection: 'var(--bricks-flex-direction, var(--bricks-flex-direction-desktop, row))',
        justifyContent:
            'var(--bricks-flex-justify, var(--bricks-flex-justify-desktop, flex-start))',
        alignItems: mapFlexAlign(currentProps.align),
        flexWrap: 'var(--bricks-flex-wrap, var(--bricks-flex-wrap-desktop, nowrap))',
        gap: 'var(--bricks-flex-gap, var(--bricks-flex-gap-desktop, 0rem))',
        minHeight: 'auto',
        backgroundColor: 'transparent',
        border: 'none',
        borderRadius: '0',
        '--bricks-flex-direction-mobile': directionMobile,
        '--bricks-flex-direction-tablet': directionTablet,
        '--bricks-flex-direction-desktop': directionDesktop,
        '--bricks-flex-justify-mobile': justifyMobile,
        '--bricks-flex-justify-tablet': justifyTablet,
        '--bricks-flex-justify-desktop': justifyDesktop,
        '--bricks-flex-wrap-mobile': wrapMobile,
        '--bricks-flex-wrap-tablet': wrapTablet,
        '--bricks-flex-wrap-desktop': wrapDesktop,
        '--bricks-flex-gap-mobile': convertPxToRem(gapMobile),
        '--bricks-flex-gap-tablet': convertPxToRem(gapTablet),
        '--bricks-flex-gap-desktop': convertPxToRem(gapDesktop),
    };

    const basePaddingX = Math.round(Math.max(0, Number(currentProps.paddingX) || 0) * 10) / 10;
    const basePaddingY = Math.round(Math.max(0, Number(currentProps.paddingY) || 0) * 10) / 10;

    if (basePaddingX > 0 || basePaddingY > 0) {
        (style as Record<string, string>).padding = `${basePaddingY}rem ${basePaddingX}rem`;
    }

    Object.assign(style as Record<string, string>, gridPlacementStyle(component));

    const childComponents = getChildComponents(component);

    return h(
        'div',
        {
            id: component.htmlId || undefined,
            style,
            class: [styles.bricksFlex, ...extraClasses],
            'data-bricks-layout': 'flex',
            ...extraAttrs,
        },
        childComponents.map((child) => renderChild(child))
    );
}

/**
 * Definition блока Flex: flex-контейнер с children в default slot.
 * Дефолт `wrap: false` — по поведению создания (сверка дефолтов, Часть B).
 */
export const blockFlexDefinition: IBlockDefinition = {
    name: 'Flex',
    description: 'bricks.blocks.flex.description',
    thumbnail: 'images/layouts/flex.svg',
    hasChildren: true,
    responsiveMode: 'all',
    responsiveCssVars: {
        prefix: 'flex',
        vars: ['direction', 'justify', 'wrap', 'gap'],
    },
    renderPublished: renderFlexPublished,
    properties: [
        {
            name: 'direction',
            type: 'select',
            label: 'bricks.blocks.flex.props.direction.label',
            default: 'row',
            description: 'bricks.blocks.flex.props.direction.description',
            options: [
                { label: 'bricks.blocks.flex.props.direction.options.row', value: 'row' },
                { label: 'bricks.blocks.flex.props.direction.options.column', value: 'column' },
            ],
        },
        {
            name: 'justify',
            type: 'select',
            label: 'bricks.blocks.flex.props.justify.label',
            default: 'start',
            description: 'bricks.blocks.flex.props.justify.description',
            options: [
                { label: 'bricks.blocks.flex.props.justify.options.start', value: 'start' },
                { label: 'bricks.blocks.flex.props.justify.options.center', value: 'center' },
                { label: 'bricks.blocks.flex.props.justify.options.end', value: 'end' },
                {
                    label: 'bricks.blocks.flex.props.justify.options.spaceBetween',
                    value: 'space-between',
                },
                {
                    label: 'bricks.blocks.flex.props.justify.options.spaceAround',
                    value: 'space-around',
                },
            ],
        },
        {
            name: 'align',
            type: 'select',
            label: 'bricks.blocks.flex.props.align.label',
            default: 'stretch',
            description: 'bricks.blocks.flex.props.align.description',
            options: [
                { label: 'bricks.blocks.flex.props.align.options.stretch', value: 'stretch' },
                { label: 'bricks.blocks.flex.props.align.options.start', value: 'start' },
                { label: 'bricks.blocks.flex.props.align.options.center', value: 'center' },
                { label: 'bricks.blocks.flex.props.align.options.end', value: 'end' },
                { label: 'bricks.blocks.flex.props.align.options.baseline', value: 'baseline' },
            ],
        },
        {
            name: 'gap',
            type: 'number',
            label: 'bricks.blocks.flex.props.gap.label',
            default: 24,
            min: 0,
            description: 'bricks.blocks.flex.props.gap.description',
        },
        {
            name: 'wrap',
            type: 'boolean',
            label: 'bricks.blocks.flex.props.wrap.label',
            default: false,
            description: 'bricks.blocks.flex.props.wrap.description',
        },
        {
            name: 'paddingX',
            type: 'number',
            label: 'bricks.blocks.flex.props.paddingX.label',
            default: 0,
            min: 0,
            step: 0.2,
            unit: 'rem',
            group: 'bricks.blocks.flex.groups.spacing',
            description: 'bricks.blocks.flex.props.paddingX.description',
        },
        {
            name: 'paddingY',
            type: 'number',
            label: 'bricks.blocks.flex.props.paddingY.label',
            default: 0,
            min: 0,
            step: 0.2,
            unit: 'rem',
            group: 'bricks.blocks.flex.groups.spacing',
            description: 'bricks.blocks.flex.props.paddingY.description',
        },
    ],
};
