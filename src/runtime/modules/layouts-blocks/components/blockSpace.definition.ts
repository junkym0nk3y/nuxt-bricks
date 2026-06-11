// Types
import type { IBlockDefinition } from '../types/registry';

/**
 * Definition блока Space: отступ (spacer), без children.
 */
export const blockSpaceDefinition: IBlockDefinition = {
    name: 'Space',
    description: 'Отступ (spacer) между блоками по вертикали или горизонтали.',
    thumbnail: '/images/layouts/space.svg',
    responsiveMode: 'all',
    properties: [
        {
            name: 'size',
            type: 'number',
            label: 'Размер (rem)',
            default: 2.4,
            min: 0,
            step: 0.2,
            description: 'Величина отступа в rem',
            responsive: true,
        },
        {
            name: 'direction',
            type: 'select',
            label: 'Направление',
            default: 'vertical',
            description: 'В каком направлении применяется отступ',
            options: [
                { label: 'Вертикально', value: 'vertical' },
                { label: 'Горизонтально', value: 'horizontal' },
                { label: 'Оба направления', value: 'both' },
            ],
        },
        {
            name: 'showDivider',
            type: 'boolean',
            label: 'Показать разделитель',
            default: false,
            description: 'Отображать линию-разделитель',
            group: 'Разделитель',
        },
        {
            name: 'dividerColor',
            type: 'color',
            label: 'Цвет разделителя',
            default: '',
            description: 'Пустое значение = var(--bricks-base-200)',
            group: 'Разделитель',
        },
        {
            name: 'dividerWidth',
            type: 'number',
            label: 'Толщина разделителя (px)',
            default: 1,
            min: 1,
            max: 10,
            group: 'Разделитель',
        },
        {
            name: 'dividerStyle',
            type: 'select',
            label: 'Стиль разделителя',
            default: 'solid',
            options: [
                { label: 'Сплошная', value: 'solid' },
                { label: 'Пунктирная', value: 'dashed' },
                { label: 'Точечная', value: 'dotted' },
            ],
            group: 'Разделитель',
        },
        {
            name: 'dividerMarginX',
            type: 'number',
            label: 'Отступы разделителя по бокам (rem)',
            default: 0,
            min: 0,
            step: 0.2,
            description: 'Горизонтальные отступы разделителя от краёв в rem',
            group: 'Разделитель',
            responsive: true,
        },
    ],
};
