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

/**
 * Маппит значение justify в CSS flex justify-content.
 *
 * @param justify - Значение выравнивания ('start', 'center', 'end', 'space-between', 'space-around').
 * @returns CSS-значение для justify-content.
 */
function mapFlexJustify(justify?: string): string {
    switch (justify) {
        case 'center':
            return 'center';
        case 'end':
            return 'flex-end';
        case 'space-between':
            return 'space-between';
        case 'space-around':
            return 'space-around';
        case 'start':
        default:
            return 'flex-start';
    }
}

/**
 * Маппит значение align в CSS flex align-items.
 *
 * @param align - Значение ('stretch', 'start', 'center', 'end', 'baseline').
 * @returns CSS-значение для align-items.
 */
function mapFlexAlign(align?: string): string {
    switch (align) {
        case 'start':
            return 'flex-start';
        case 'center':
            return 'center';
        case 'end':
            return 'flex-end';
        case 'baseline':
            return 'baseline';
        case 'stretch':
        default:
            return 'stretch';
    }
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
    const currentProps = component.props as Record<string, any>;

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

    const wrapMobileRaw = resolveResponsiveValue(Boolean(currentProps.wrap), mobileOverrides, 'wrap');
    const wrapTabletRaw = resolveResponsiveValue(Boolean(currentProps.wrap), tabletOverrides, 'wrap');
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
        justifyContent: 'var(--bricks-flex-justify, var(--bricks-flex-justify-desktop, flex-start))',
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
    description: 'Flex-контейнер для горизонтальной или вертикальной раскладки элементов.',
    thumbnail: '/images/layouts/flex.svg',
    hasChildren: true,
    responsiveMode: 'all',
    renderPublished: renderFlexPublished,
    properties: [
        {
            name: 'direction',
            type: 'select',
            label: 'Направление',
            default: 'row',
            description: 'Направление расположения элементов',
            options: [
                { label: 'Горизонтально', value: 'row' },
                { label: 'Вертикально', value: 'column' },
            ],
        },
        {
            name: 'justify',
            type: 'select',
            label: 'По главной оси',
            default: 'start',
            description: 'Для row: по горизонтали; для column: по вертикали',
            options: [
                { label: 'В начале', value: 'start' },
                { label: 'По центру', value: 'center' },
                { label: 'В конце', value: 'end' },
                { label: 'Равномерно', value: 'space-between' },
                { label: 'С отступами', value: 'space-around' },
            ],
        },
        {
            name: 'align',
            type: 'select',
            label: 'По поперечной оси',
            default: 'stretch',
            description: 'Для row: по вертикали; для column: по горизонтали',
            options: [
                { label: 'Растянуть', value: 'stretch' },
                { label: 'В начале', value: 'start' },
                { label: 'По центру', value: 'center' },
                { label: 'В конце', value: 'end' },
                { label: 'По базовой линии', value: 'baseline' },
            ],
        },
        {
            name: 'gap',
            type: 'number',
            label: 'Отступ',
            default: 24,
            min: 0,
            description: 'Расстояние между элементами в пикселях',
        },
        {
            name: 'wrap',
            type: 'boolean',
            label: 'Перенос строк',
            default: false,
            description: 'Переносить элементы на новую строку при нехватке места',
        },
        {
            name: 'paddingX',
            type: 'number',
            label: 'Padding горизонтальный (rem)',
            default: 0,
            min: 0,
            step: 0.2,
            description: 'Горизонтальный внутренний отступ контейнера в rem',
        },
        {
            name: 'paddingY',
            type: 'number',
            label: 'Padding вертикальный (rem)',
            default: 0,
            min: 0,
            step: 0.2,
            description: 'Вертикальный внутренний отступ контейнера в rem',
        },
    ],
};
