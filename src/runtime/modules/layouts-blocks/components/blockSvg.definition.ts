// Types
import type { IBlockSvgProps } from '../types/blockProps';
import type { IBlockDefinition, IBlockRenderContext } from '../types/registry';

// Vue
import { h, type VNode } from 'vue';

// Utils
import { bindBoundPropsWithComponentId } from '../utils/canvasBindings';
import {
    getResponsiveOverrides,
    gridPlacementStyle,
    makeResponsiveVars,
} from '../utils/responsiveVars';

// Components
import BlockSvg from './BlockSvg.vue';

/**
 * Published-рендер Svg: компонент в CSS-var-обёртке (per-device размеры).
 *
 * @param ctx - Контекст рендера published-страницы.
 * @returns VNode SVG-блока.
 */
function renderSvgPublished(ctx: IBlockRenderContext): VNode {
    const { component, extraClasses, extraAttrs, styles } = ctx;
    const cp = component.props as IBlockSvgProps;
    const mOv = getResponsiveOverrides(cp as Record<string, any>, 'mobile');
    const tOv = getResponsiveOverrides(cp as Record<string, any>, 'tablet');

    const style: Record<string, string> = {
        ...makeResponsiveVars('--bricks-media-width', cp.width || '4.8rem', tOv, mOv, 'width'),
        ...makeResponsiveVars('--bricks-media-height', cp.height || '4.8rem', tOv, mOv, 'height'),
        '--bricks-media-radius-desktop': '0',
        '--bricks-media-radius-tablet': '0',
        '--bricks-media-radius-mobile': '0',
    };
    Object.assign(style, gridPlacementStyle(component));

    return h(BlockSvg, {
        ...cp,
        width: 'var(--bricks-media-width)',
        height: 'var(--bricks-media-height)',
        key: component.id,
        id: component.htmlId || undefined,
        class: [styles.bricksSvg, ...extraClasses],
        style,
        'data-bricks-layout': 'svg',
        ...extraAttrs,
    });
}

/**
 * Definition блока Svg: inline-SVG с перекраской.
 * svgContent заполняется через svgContentProperty при выборе из галереи — в extraDefaults.
 */
export const blockSvgDefinition: IBlockDefinition = {
    name: 'Svg',
    description: 'SVG-блок с настройкой цвета и размера.',
    thumbnail: '/images/layouts/svg.svg',
    responsiveMode: 'all',
    // Svg шарит media-переменные (--bricks-media-*) с Media — обёртка у обоих одинаковая
    responsiveCssVars: {
        prefix: 'media',
        vars: ['width', 'height', 'radius'],
    },
    canvasBind: bindBoundPropsWithComponentId,
    renderPublished: renderSvgPublished,
    extraDefaults: {
        svgContent: '',
    },
    properties: [
        {
            name: 'src',
            type: 'image',
            label: 'SVG изображение',
            default: '',
            description: 'Выберите SVG из медиа-галереи',
            svgContentProperty: 'svgContent',
        },
        {
            name: 'color',
            type: 'color',
            label: 'Цвет',
            default: '',
            description: 'Применяется к fill/stroke SVG (пустое = оригинальные цвета)',
        },
        {
            name: 'width',
            type: 'input',
            label: 'Ширина',
            default: '4.8rem',
            unit: 'rem',
            description: 'rem или CSS value (например, 4.8rem, 100%, auto)',
        },
        {
            name: 'height',
            type: 'input',
            label: 'Высота',
            default: '4.8rem',
            unit: 'rem',
            description: 'rem или CSS value',
        },
        {
            name: 'alignment',
            type: 'select',
            label: 'Выравнивание',
            default: 'left',
            options: [
                { label: 'Слева', value: 'left' },
                { label: 'По центру', value: 'center' },
                { label: 'Справа', value: 'right' },
            ],
        },
        {
            name: 'marginTop',
            type: 'number',
            label: 'Margin Top (rem)',
            default: 0,
            min: 0,
            step: 0.2,
        },
        {
            name: 'marginBottom',
            type: 'number',
            label: 'Margin Bottom (rem)',
            default: 0,
            min: 0,
            step: 0.2,
        },
    ],
};
