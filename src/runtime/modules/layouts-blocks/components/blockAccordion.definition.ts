// Types
import type { IAccordionLayoutProps } from '../types/blockProps';
import type { IBlockDefinition, IBlockRenderContext } from '../types/registry';

// Vue
import { h, type VNode } from 'vue';

// Utils
import { gridPlacementStyle } from '../utils/responsiveVars';

// Components
import BlockAccordion from './BlockAccordion.vue';

/**
 * Published-рендер Accordion: канвасный компонент без editor chrome — рендерим напрямую.
 *
 * @param ctx - Контекст рендера published-страницы.
 * @returns VNode аккордеона.
 */
function renderAccordionPublished(ctx: IBlockRenderContext): VNode {
    const { component, extraClasses, extraAttrs } = ctx;
    const componentProps = component.props as IAccordionLayoutProps;
    const style = gridPlacementStyle(component);

    return h(BlockAccordion, {
        layoutProps: componentProps,
        key: component.id,
        id: component.htmlId || undefined,
        class: extraClasses,
        style: Object.keys(style).length ? style : undefined,
        ...extraAttrs,
    });
}

/**
 * Definition блока Accordion: раскрывающиеся элементы.
 */
export const blockAccordionDefinition: IBlockDefinition = {
    name: 'Accordion',
    description: 'bricks.blocks.accordion.description',
    thumbnail: '/images/layouts/accordion.svg',
    isInteractive: true,
    responsiveMode: 'none',
    renderPublished: renderAccordionPublished,
    properties: [
        {
            name: 'items',
            type: 'accordion-items',
            label: 'bricks.blocks.accordion.props.items.label',
            default: [{ title: 'Вопрос 1', content: '<p>Ответ на первый вопрос</p>' }],
            description: 'bricks.blocks.accordion.props.items.description',
        },
        {
            name: 'allowMultiple',
            type: 'boolean',
            label: 'bricks.blocks.accordion.props.allowMultiple.label',
            default: false,
            description: 'bricks.blocks.accordion.props.allowMultiple.description',
        },
        {
            name: 'initialOpenIndex',
            type: 'number',
            label: 'bricks.blocks.accordion.props.initialOpenIndex.label',
            default: -1,
            description: 'bricks.blocks.accordion.props.initialOpenIndex.description',
        },
        {
            name: 'gap',
            type: 'number',
            label: 'bricks.blocks.accordion.props.gap.label',
            default: 0,
            min: 0,
            step: 0.2,
            description: 'bricks.blocks.accordion.props.gap.description',
        },
        {
            name: 'borderRadius',
            type: 'number',
            label: 'bricks.blocks.accordion.props.borderRadius.label',
            default: 0.8,
            min: 0,
            step: 0.2,
            description: 'bricks.blocks.accordion.props.borderRadius.description',
        },
        {
            name: 'accentColor',
            type: 'color',
            label: 'bricks.blocks.accordion.props.accentColor.label',
            default: '',
            description: 'bricks.blocks.accordion.props.accentColor.description',
        },
        {
            name: 'animationDuration',
            type: 'number',
            label: 'bricks.blocks.accordion.props.animationDuration.label',
            default: 250,
            min: 0,
            step: 50,
            description: 'bricks.blocks.accordion.props.animationDuration.description',
        },
    ],
};
