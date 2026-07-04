// Types
import type { IBlockDefinition, IBlockRenderContext } from '../types/registry';

// Vue
import { h, type VNode } from 'vue';

// Utils
import { createInlineTextSegment } from '../utils/inlineContent';
import { bindBoundPropsWithComponentId } from '../utils/canvasBindings';
import { gridPlacementStyle } from '../utils/responsiveVars';

// Components
import BlockTitle from './BlockTitle.vue';

/**
 * Published-рендер Title: канвасный компонент без editor chrome — рендерим напрямую.
 *
 * @param ctx - Контекст рендера published-страницы.
 * @returns VNode Title.
 */
function renderTitlePublished(ctx: IBlockRenderContext): VNode {
    const { component, extraClasses, extraAttrs, styles } = ctx;
    const componentProps = component.props as Record<string, any>;
    const style = gridPlacementStyle(component);

    return h(BlockTitle, {
        ...componentProps,
        key: component.id,
        id: component.htmlId || undefined,
        class: [styles.bricksTitle, ...extraClasses],
        style: Object.keys(style).length ? style : undefined,
        ...extraAttrs,
    });
}

/**
 * Definition блока Title: заголовок с inline-контентом.
 * properties — функция: опции fontFamily зависят от runtime availableFonts.
 * Дефолт `marginBottom: 0` — по поведению создания (сверка дефолтов, Часть B).
 */
export const blockTitleDefinition: IBlockDefinition = {
    name: 'Title',
    description: 'bricks.blocks.title.description',
    thumbnail: '/images/layouts/title.svg',
    responsiveMode: 'none',
    canvasBind: bindBoundPropsWithComponentId,
    renderPublished: renderTitlePublished,
    properties: ({ availableFonts }) => [
        {
            name: 'inlineContent',
            type: 'inline-content',
            label: 'bricks.blocks.title.props.inlineContent.label',
            default: [createInlineTextSegment('Текст заголовка')],
            description: 'bricks.blocks.title.props.inlineContent.description',
        },
        {
            name: 'headingType',
            type: 'select',
            label: 'bricks.blocks.title.props.headingType.label',
            default: 'h2',
            options: [
                { label: 'bricks.blocks.title.props.headingType.options.h1', value: 'h1' },
                { label: 'bricks.blocks.title.props.headingType.options.h2', value: 'h2' },
                { label: 'bricks.blocks.title.props.headingType.options.h3', value: 'h3' },
                { label: 'bricks.blocks.title.props.headingType.options.h4', value: 'h4' },
                { label: 'bricks.blocks.title.props.headingType.options.h5', value: 'h5' },
                { label: 'bricks.blocks.title.props.headingType.options.h6', value: 'h6' },
            ],
        },
        {
            name: 'fontFamily',
            type: 'select',
            label: 'bricks.blocks.title.props.fontFamily.label',
            default: '',
            options: [
                { label: 'bricks.blocks.title.props.fontFamily.options.default', value: '' },
                ...availableFonts.map((font: string) => ({ label: font, value: font })),
            ],
        },
        {
            name: 'fontWeight',
            type: 'select',
            label: 'bricks.blocks.title.props.fontWeight.label',
            default: 600,
            options: [
                { label: 'bricks.blocks.title.props.fontWeight.options.thin', value: 100 },
                { label: 'bricks.blocks.title.props.fontWeight.options.extraLight', value: 200 },
                { label: 'bricks.blocks.title.props.fontWeight.options.light', value: 300 },
                { label: 'bricks.blocks.title.props.fontWeight.options.regular', value: 400 },
                { label: 'bricks.blocks.title.props.fontWeight.options.medium', value: 500 },
                { label: 'bricks.blocks.title.props.fontWeight.options.semiBold', value: 600 },
                { label: 'bricks.blocks.title.props.fontWeight.options.bold', value: 700 },
                { label: 'bricks.blocks.title.props.fontWeight.options.extraBold', value: 800 },
                { label: 'bricks.blocks.title.props.fontWeight.options.black', value: 900 },
            ],
        },
        {
            name: 'textAlign',
            type: 'select',
            label: 'bricks.blocks.title.props.textAlign.label',
            default: 'left',
            options: [
                { label: 'bricks.blocks.title.props.textAlign.options.left', value: 'left' },
                { label: 'bricks.blocks.title.props.textAlign.options.center', value: 'center' },
                { label: 'bricks.blocks.title.props.textAlign.options.right', value: 'right' },
            ],
        },
        {
            name: 'fontSize',
            type: 'number',
            label: 'bricks.blocks.title.props.fontSize.label',
            default: 0,
            min: 0,
            step: 0.2,
        },
        {
            name: 'lineHeight',
            type: 'number',
            label: 'bricks.blocks.title.props.lineHeight.label',
            default: 0,
            min: 0,
            step: 0.1,
            description: 'bricks.blocks.title.props.lineHeight.description',
        },
        {
            name: 'letterSpacing',
            type: 'select',
            label: 'bricks.blocks.title.props.letterSpacing.label',
            default: '',
            description: 'bricks.blocks.title.props.letterSpacing.description',
            options: [
                { label: 'bricks.blocks.title.props.letterSpacing.options.normal', value: '' },
                {
                    label: 'bricks.blocks.title.props.letterSpacing.options.remNeg02',
                    value: '-0.2rem',
                },
                {
                    label: 'bricks.blocks.title.props.letterSpacing.options.remNeg01',
                    value: '-0.1rem',
                },
                { label: 'bricks.blocks.title.props.letterSpacing.options.rem0', value: '0rem' },
                {
                    label: 'bricks.blocks.title.props.letterSpacing.options.rem005',
                    value: '0.05rem',
                },
                { label: 'bricks.blocks.title.props.letterSpacing.options.rem01', value: '0.1rem' },
                {
                    label: 'bricks.blocks.title.props.letterSpacing.options.rem015',
                    value: '0.15rem',
                },
                { label: 'bricks.blocks.title.props.letterSpacing.options.rem02', value: '0.2rem' },
                {
                    label: 'bricks.blocks.title.props.letterSpacing.options.rem025',
                    value: '0.25rem',
                },
                { label: 'bricks.blocks.title.props.letterSpacing.options.rem03', value: '0.3rem' },
                { label: 'bricks.blocks.title.props.letterSpacing.options.rem04', value: '0.4rem' },
                { label: 'bricks.blocks.title.props.letterSpacing.options.rem05', value: '0.5rem' },
            ],
        },
        {
            name: 'marginTop',
            type: 'number',
            label: 'bricks.blocks.title.props.marginTop.label',
            default: 0,
            min: 0,
            step: 0.2,
        },
        {
            name: 'marginBottom',
            type: 'number',
            label: 'bricks.blocks.title.props.marginBottom.label',
            default: 0,
            min: 0,
            step: 0.2,
        },
    ],
};
