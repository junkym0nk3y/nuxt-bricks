// Types
import type { IBlockDefinition, IBlockRenderContext } from '../types/registry';

// Vue
import { h, defineAsyncComponent, type VNode } from 'vue';

// Utils
import { gridPlacementStyle, makeResponsiveVars, toRem } from '../utils/responsiveVars';

// Components
// Async-импорт (паттерн blockSlider): registry импортируется плагином bricks-styles
// на каждой странице — компонент не должен попадать в entry-бандл. Канвас
// использует eager-версию из canvasBlockComponents.ts.
const BlockMedia = defineAsyncComponent(() => import('./BlockMedia.vue'));

/**
 * Published-рендер Media: компонент в CSS-var-обёртке (per-device размеры).
 *
 * @param ctx - Контекст рендера published-страницы.
 * @returns VNode медиа-компонента.
 */
function renderMediaPublished(ctx: IBlockRenderContext): VNode {
    const { component, extraClasses, extraAttrs, styles } = ctx;
    const cp = component.props as Record<string, unknown>;

    const style: Record<string, string> = {
        ...makeResponsiveVars('--bricks-media-width', cp.width || '100%', cp, 'width'),
        ...makeResponsiveVars('--bricks-media-height', cp.height || 'auto', cp, 'height'),
        ...makeResponsiveVars(
            '--bricks-media-radius',
            cp.borderRadius || '0',
            cp,
            'borderRadius',
            toRem
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
    thumbnail: 'images/layouts/media.svg',
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
        // Адреса вариантов постепенной загрузки и пиксельные размеры файла:
        // заполняются выбором картинки из галереи, руками не правятся — поэтому
        // вне панели свойств
        previewSrc: '',
        mockSrc: '',
        naturalWidth: 0,
        naturalHeight: 0,
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
            previewUrlProperty: 'previewSrc',
            mockUrlProperty: 'mockSrc',
            naturalWidthProperty: 'naturalWidth',
            naturalHeightProperty: 'naturalHeight',
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
            name: 'loadMode',
            type: 'select',
            label: 'bricks.blocks.media.props.loadMode.label',
            description: 'bricks.blocks.media.props.loadMode.description',
            group: 'bricks.blocks.media.groups.loading',
            default: 'config',
            options: [
                {
                    label: 'bricks.blocks.media.props.loadMode.options.config',
                    value: 'config',
                },
                { label: 'bricks.blocks.media.props.loadMode.options.off', value: 'off' },
                { label: 'bricks.blocks.media.props.loadMode.options.twoStep', value: 'two-step' },
                {
                    label: 'bricks.blocks.media.props.loadMode.options.threeStep',
                    value: 'three-step',
                },
            ],
            showWhen: { field: 'type', equals: 'image' },
        },
        {
            name: 'eagerLoad',
            type: 'boolean',
            label: 'bricks.blocks.media.props.eagerLoad.label',
            description: 'bricks.blocks.media.props.eagerLoad.description',
            group: 'bricks.blocks.media.groups.loading',
            default: false,
            showWhen: { field: 'type', equals: 'image' },
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
