// Types
import type { IBlockSvgProps } from '../types/blockProps';
import type { IBlockDefinition, IBlockRenderContext } from '../types/registry';

// Vue
import { h, defineAsyncComponent, type VNode } from 'vue';

// Utils
import { bindBoundPropsWithComponentId } from '../utils/canvasBindings';
import { gridPlacementStyle, makeResponsiveVars } from '../utils/responsiveVars';

// Components
// Async-импорт (паттерн blockSlider): статический импорт утащил бы санитайзер (xss)
// в entry-бандл всех страниц потребителя. Канвас использует eager-версию
// из canvasBlockComponents.ts.
const BlockSvg = defineAsyncComponent(() => import('./BlockSvg.vue'));

/**
 * Published-рендер Svg: компонент в CSS-var-обёртке (per-device размеры).
 *
 * @param ctx - Контекст рендера published-страницы.
 * @returns VNode SVG-блока.
 */
function renderSvgPublished(ctx: IBlockRenderContext): VNode {
    const { component, extraClasses, extraAttrs, styles } = ctx;
    const cp = component.props as IBlockSvgProps;
    const props = cp as Record<string, unknown>;

    const style: Record<string, string> = {
        ...makeResponsiveVars('--bricks-media-width', cp.width || '4.8rem', props, 'width'),
        ...makeResponsiveVars('--bricks-media-height', cp.height || '4.8rem', props, 'height'),
        // Скругления у SVG нет ни на одном устройстве: prefix общий с Media,
        // и без базового значения блок унаследовал бы радиус картинки
        '--bricks-media-radius-base': '0',
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
    description: 'bricks.blocks.svg.description',
    thumbnail: 'images/layouts/svg.svg',
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
            label: 'bricks.blocks.svg.props.src.label',
            default: '',
            description: 'bricks.blocks.svg.props.src.description',
            svgContentProperty: 'svgContent',
        },
        {
            name: 'color',
            type: 'color',
            label: 'bricks.blocks.svg.props.color.label',
            default: '',
            description: 'bricks.blocks.svg.props.color.description',
        },
        {
            name: 'width',
            type: 'input',
            label: 'bricks.blocks.svg.props.width.label',
            default: '4.8rem',
            unit: 'rem',
            description: 'bricks.blocks.svg.props.width.description',
        },
        {
            name: 'height',
            type: 'input',
            label: 'bricks.blocks.svg.props.height.label',
            default: '4.8rem',
            unit: 'rem',
            description: 'bricks.blocks.svg.props.height.description',
        },
        {
            name: 'alignment',
            type: 'select',
            label: 'bricks.blocks.svg.props.alignment.label',
            default: 'left',
            options: [
                { label: 'bricks.blocks.svg.props.alignment.options.left', value: 'left' },
                { label: 'bricks.blocks.svg.props.alignment.options.center', value: 'center' },
                { label: 'bricks.blocks.svg.props.alignment.options.right', value: 'right' },
            ],
        },
        {
            name: 'marginTop',
            type: 'number',
            label: 'bricks.blocks.svg.props.marginTop.label',
            default: 0,
            min: 0,
            step: 0.2,
            unit: 'rem',
            group: 'bricks.blocks.svg.groups.spacing',
        },
        {
            name: 'marginBottom',
            type: 'number',
            label: 'bricks.blocks.svg.props.marginBottom.label',
            default: 0,
            min: 0,
            step: 0.2,
            unit: 'rem',
            group: 'bricks.blocks.svg.groups.spacing',
        },
    ],
};
