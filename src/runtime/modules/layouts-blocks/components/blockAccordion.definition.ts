// Types
import type { AccordionLayoutProps } from '../types/blockProps';
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
    const componentProps = component.props as AccordionLayoutProps;
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
    description: 'Аккордеон — список раскрывающихся элементов с заголовком и контентом.',
    thumbnail: '/images/layouts/accordion.svg',
    isInteractive: true,
    responsiveMode: 'none',
    renderPublished: renderAccordionPublished,
    properties: [
        {
            name: 'items',
            type: 'accordion-items',
            label: 'Элементы',
            default: [{ title: 'Вопрос 1', content: '<p>Ответ на первый вопрос</p>' }],
            description: 'Список элементов аккордеона (массив объектов {title, content})',
        },
        {
            name: 'allowMultiple',
            type: 'boolean',
            label: 'Открывать несколько',
            default: false,
            description: 'Разрешить одновременное открытие нескольких элементов',
        },
        {
            name: 'initialOpenIndex',
            type: 'number',
            label: 'Открыт по умолчанию (индекс)',
            default: -1,
            description: 'Индекс элемента, открытого при загрузке (-1 = все закрыты)',
        },
        {
            name: 'gap',
            type: 'number',
            label: 'Отступ между элементами (rem)',
            default: 0,
            min: 0,
            step: 0.2,
            description: 'Отступ между элементами (0 = единый блок, >0 = карточный режим)',
        },
        {
            name: 'borderRadius',
            type: 'number',
            label: 'Скругление углов (rem)',
            default: 0.8,
            min: 0,
            step: 0.2,
            description: 'Радиус скругления углов аккордеона или карточек',
        },
        {
            name: 'accentColor',
            type: 'color',
            label: 'Акцентный цвет',
            default: '',
            description: 'Акцентный цвет для hover, бордеров и фона',
        },
        {
            name: 'animationDuration',
            type: 'number',
            label: 'Скорость анимации (ms)',
            default: 250,
            min: 0,
            step: 50,
            description: 'Длительность анимации раскрытия/закрытия в миллисекундах',
        },
    ],
};
