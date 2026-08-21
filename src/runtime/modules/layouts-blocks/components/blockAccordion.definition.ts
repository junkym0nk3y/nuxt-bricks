// Types
import type { IAccordionLayoutProps } from '../types/blockProps';
import type { IBlockDefinition, IBlockRenderContext } from '../types/registry';

// Vue
import { h, defineAsyncComponent, type VNode } from 'vue';

// Utils
import { resolvePublishedProps } from '../utils/publishedProps';
import { gridPlacementStyle } from '../utils/responsiveVars';

// Components
// Async import (the blockSlider pattern): a static import would drag reka-ui and the
// sanitizer into the entry bundle of every page of the consumer (the registry is imported
// by the bricks-styles plugin). The canvas uses the eager version out of
// canvasBlockComponents.ts.
const BlockAccordion = defineAsyncComponent(() => import('./BlockAccordion.vue'));

/**
 * Published render of Accordion: the canvas component without the editor chrome, so it
 * is rendered directly.
 *
 * @param ctx - Render context of the published page.
 * @returns VNode of the accordion.
 */
function renderAccordionPublished(ctx: IBlockRenderContext): VNode {
    const { component, definition, extraClasses, extraAttrs } = ctx;
    const componentProps = resolvePublishedProps<IAccordionLayoutProps>(
        definition,
        component.props
    );
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
 * Definition of the Accordion block: expandable items.
 */
export const blockAccordionDefinition: IBlockDefinition = {
    name: 'Accordion',
    description: 'bricks.blocks.accordion.description',
    thumbnail: 'images/layouts/accordion.svg',
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
