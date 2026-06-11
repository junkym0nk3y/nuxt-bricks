// Types
import type { SectionLayoutProps } from '../types/blockProps';
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
    const cp = component.props as SectionLayoutProps;
    const mOv = getResponsiveOverrides(cp as Record<string, any>, 'mobile');
    const tOv = getResponsiveOverrides(cp as Record<string, any>, 'tablet');

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
    description: 'Секция-обёртка с настраиваемым фоном (цвет, изображение) и padding.',
    thumbnail: '/images/layouts/section.svg',
    hasChildren: true,
    responsiveMode: 'all',
    renderPublished: renderSectionPublished,
    properties: [
        {
            name: 'backgroundColor',
            type: 'color',
            label: 'Цвет фона',
            default: '',
            description: 'CSS color или CSS variable (например, var(--bricks-base-900))',
            group: 'Фон',
        },
        {
            name: 'backgroundImage',
            type: 'image',
            label: 'Фоновое изображение',
            default: '',
            description: 'URL фонового изображения',
            group: 'Фон',
        },
        {
            name: 'paddingTop',
            type: 'number',
            label: 'Padding сверху (rem)',
            default: 4,
            min: 0,
            step: 0.2,
            group: 'Отступы',
            responsive: true,
        },
        {
            name: 'paddingBottom',
            type: 'number',
            label: 'Padding снизу (rem)',
            default: 4,
            min: 0,
            step: 0.2,
            group: 'Отступы',
            responsive: true,
        },
        {
            name: 'paddingX',
            type: 'number',
            label: 'Padding горизонтальный (rem)',
            default: 0,
            min: 0,
            step: 0.2,
            group: 'Отступы',
            responsive: true,
        },
        {
            name: 'borderRadius',
            type: 'number',
            label: 'Скругление углов (rem)',
            default: 0,
            min: 0,
            step: 0.2,
            responsive: true,
        },
        {
            name: 'minHeight',
            type: 'number',
            label: 'Мин. высота (rem)',
            default: 0,
            min: 0,
            step: 0.2,
            description: 'Минимальная высота секции (0 = по контенту)',
            responsive: true,
        },
    ],
};
