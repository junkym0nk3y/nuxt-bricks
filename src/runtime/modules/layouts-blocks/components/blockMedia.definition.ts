// Types
import type { IBlockDefinition, IBlockRenderContext } from '../types/registry';

// Vue
import { h, type VNode } from 'vue';

// Utils
import {
    getResponsiveOverrides,
    gridPlacementStyle,
    makeResponsiveVars,
} from '../utils/responsiveVars';

// Components
import BlockMedia from './BlockMedia.vue';

/**
 * Published-рендер Media: компонент в CSS-var-обёртке (per-device размеры).
 *
 * @param ctx - Контекст рендера published-страницы.
 * @returns VNode медиа-компонента.
 */
function renderMediaPublished(ctx: IBlockRenderContext): VNode {
    const { component, extraClasses, extraAttrs, styles } = ctx;
    const cp = component.props as Record<string, any>;
    const mOv = getResponsiveOverrides(cp, 'mobile');
    const tOv = getResponsiveOverrides(cp, 'tablet');

    const style: Record<string, string> = {
        ...makeResponsiveVars('--bricks-media-width', cp.width || '100%', tOv, mOv, 'width'),
        ...makeResponsiveVars('--bricks-media-height', cp.height || 'auto', tOv, mOv, 'height'),
        ...makeResponsiveVars(
            '--bricks-media-radius',
            cp.borderRadius || '0',
            tOv,
            mOv,
            'borderRadius'
        ),
    };
    Object.assign(style, gridPlacementStyle(component));

    return h(BlockMedia, {
        ...cp,
        width: 'var(--bricks-media-width)',
        height: 'var(--bricks-media-height)',
        borderRadius: 'var(--bricks-media-radius)',
        key: component.id,
        id: component.htmlId || undefined,
        class: [styles.bricksImage, ...extraClasses],
        style,
        'data-bricks-layout': 'media',
        ...extraAttrs,
    });
}

/**
 * Definition блока Media: изображение/видео.
 * Видео-флаги вне панели свойств — в extraDefaults.
 */
export const blockMediaDefinition: IBlockDefinition = {
    name: 'Media',
    description: 'Медиа-блок (изображение или видео) с настройками отображения.',
    thumbnail: '/images/layouts/media.svg',
    responsiveMode: 'all',
    responsiveCssVars: {
        prefix: 'media',
        vars: ['width', 'height', 'radius'],
    },
    canvasBind: (ctx) => ({
        ...ctx.boundProps,
        width: ctx.layoutProps.width,
        height: ctx.layoutProps.height,
        borderRadius: ctx.layoutProps.borderRadius,
    }),
    renderPublished: renderMediaPublished,
    extraDefaults: {
        autoplay: false,
        loop: false,
        muted: true,
        controls: true,
    },
    properties: [
        {
            name: 'type',
            type: 'select',
            label: 'Тип медиа',
            default: 'image',
            options: [
                { label: 'Изображение', value: 'image' },
                { label: 'Видео', value: 'video' },
            ],
        },
        {
            name: 'src',
            type: 'image',
            label: 'Источник',
            default: '',
        },
        {
            name: 'alt',
            type: 'input',
            label: 'Alt текст',
            default: 'Media',
        },
        {
            name: 'objectFit',
            type: 'select',
            label: 'Заполнение',
            default: 'cover',
            options: [
                { label: 'Вписать', value: 'contain' },
                { label: 'Заполнить', value: 'cover' },
                { label: 'Растянуть', value: 'fill' },
                { label: 'Без масштаба', value: 'none' },
                { label: 'Уменьшить', value: 'scale-down' },
            ],
        },
        {
            name: 'width',
            type: 'input',
            label: 'Ширина',
            default: '100%',
            unit: 'rem',
            description: 'Ширина (rem, %, auto)',
            group: 'Размеры',
            responsive: true,
        },
        {
            name: 'height',
            type: 'input',
            label: 'Высота',
            default: 'auto',
            unit: 'rem',
            description: 'Высота (rem, %, auto)',
            group: 'Размеры',
            responsive: true,
        },
        {
            name: 'borderRadius',
            type: 'input',
            label: 'Скругление углов',
            default: '0',
            unit: 'rem',
            description: 'Скругление углов (rem)',
            group: 'Размеры',
            responsive: true,
        },
    ],
};
