// Types
import type { IBlockDefinition, IBlockRenderContext } from '../types/registry';

// Vue
import { h, type VNode } from 'vue';

// Utils
import { bindBoundPropsWithComponentId } from '../utils/canvasBindings';
import { gridPlacementStyle } from '../utils/responsiveVars';

// Components
import BlockText from './BlockText.vue';

/**
 * Published-рендер Text: канвасный компонент без editor chrome — рендерим напрямую.
 *
 * @param ctx - Контекст рендера published-страницы.
 * @returns VNode Text.
 */
function renderTextPublished(ctx: IBlockRenderContext): VNode {
    const { component, extraClasses, extraAttrs, styles } = ctx;
    const componentProps = component.props as Record<string, unknown>;
    const style = gridPlacementStyle(component);

    return h(BlockText, {
        ...componentProps,
        key: component.id,
        id: component.htmlId || undefined,
        class: [styles.bricksText, ...extraClasses],
        style: Object.keys(style).length ? style : undefined,
        ...extraAttrs,
    });
}

/**
 * Definition блока Text: HTML-текст.
 * Дефолт content — RU-строка по поведению создания (сверка дефолтов, Часть B).
 */
export const blockTextDefinition: IBlockDefinition = {
    name: 'Text',
    description: 'bricks.blocks.text.description',
    thumbnail: '/images/layouts/text.svg',
    responsiveMode: 'none',
    canvasBind: bindBoundPropsWithComponentId,
    renderPublished: renderTextPublished,
    properties: [
        {
            name: 'content',
            type: 'textarea',
            label: 'bricks.blocks.text.props.content.label',
            default: '<p>Введите текст</p>',
        },
        {
            name: 'marginTop',
            type: 'number',
            label: 'bricks.blocks.text.props.marginTop.label',
            default: 0,
            step: 0.2,
            unit: 'rem',
            group: 'bricks.blocks.text.groups.spacing',
        },
        {
            name: 'marginBottom',
            type: 'number',
            label: 'bricks.blocks.text.props.marginBottom.label',
            default: 0,
            step: 0.2,
            unit: 'rem',
            group: 'bricks.blocks.text.groups.spacing',
        },
    ],
};
