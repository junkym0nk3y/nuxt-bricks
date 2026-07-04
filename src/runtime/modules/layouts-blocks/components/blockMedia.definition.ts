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
    description: 'bricks.blocks.media.description',
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
            label: 'bricks.blocks.media.props.type.label',
            default: 'image',
            options: [
                { label: 'bricks.blocks.media.props.type.options.image', value: 'image' },
                { label: 'bricks.blocks.media.props.type.options.video', value: 'video' },
            ],
        },
        {
            name: 'src',
            type: 'image',
            label: 'bricks.blocks.media.props.src.label',
            default: '',
        },
        {
            name: 'alt',
            type: 'input',
            label: 'bricks.blocks.media.props.alt.label',
            default: 'Media',
        },
        {
            name: 'objectFit',
            type: 'select',
            label: 'bricks.blocks.media.props.objectFit.label',
            default: 'cover',
            options: [
                { label: 'bricks.blocks.media.props.objectFit.options.contain', value: 'contain' },
                { label: 'bricks.blocks.media.props.objectFit.options.cover', value: 'cover' },
                { label: 'bricks.blocks.media.props.objectFit.options.fill', value: 'fill' },
                { label: 'bricks.blocks.media.props.objectFit.options.none', value: 'none' },
                {
                    label: 'bricks.blocks.media.props.objectFit.options.scaleDown',
                    value: 'scale-down',
                },
            ],
        },
        {
            name: 'width',
            type: 'input',
            label: 'bricks.blocks.media.props.width.label',
            default: '100%',
            unit: 'rem',
            description: 'bricks.blocks.media.props.width.description',
            group: 'bricks.blocks.media.groups.sizes',
            responsive: true,
        },
        {
            name: 'height',
            type: 'input',
            label: 'bricks.blocks.media.props.height.label',
            default: 'auto',
            unit: 'rem',
            description: 'bricks.blocks.media.props.height.description',
            group: 'bricks.blocks.media.groups.sizes',
            responsive: true,
        },
        {
            name: 'borderRadius',
            type: 'input',
            label: 'bricks.blocks.media.props.borderRadius.label',
            default: '0',
            unit: 'rem',
            description: 'bricks.blocks.media.props.borderRadius.description',
            group: 'bricks.blocks.media.groups.sizes',
            responsive: true,
        },
    ],
};
