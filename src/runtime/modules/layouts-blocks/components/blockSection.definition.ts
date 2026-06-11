// Types
import type { IBlockDefinition } from '../types/registry';

/**
 * Definition блока Section: секция-обёртка с фоном, children в default slot.
 */
export const blockSectionDefinition: IBlockDefinition = {
    name: 'Section',
    description: 'Секция-обёртка с настраиваемым фоном (цвет, изображение) и padding.',
    thumbnail: '/images/layouts/section.svg',
    hasChildren: true,
    responsiveMode: 'all',
    properties: [
        {
            name: 'backgroundColor',
            type: 'color',
            label: 'Цвет фона',
            default: '',
            description: 'CSS color или CSS variable (например, var(--bricks-base-900))',
            group: 'Фон',
        },
        {
            name: 'backgroundImage',
            type: 'image',
            label: 'Фоновое изображение',
            default: '',
            description: 'URL фонового изображения',
            group: 'Фон',
        },
        {
            name: 'paddingTop',
            type: 'number',
            label: 'Padding сверху (rem)',
            default: 4,
            min: 0,
            step: 0.2,
            group: 'Отступы',
            responsive: true,
        },
        {
            name: 'paddingBottom',
            type: 'number',
            label: 'Padding снизу (rem)',
            default: 4,
            min: 0,
            step: 0.2,
            group: 'Отступы',
            responsive: true,
        },
        {
            name: 'paddingX',
            type: 'number',
            label: 'Padding горизонтальный (rem)',
            default: 0,
            min: 0,
            step: 0.2,
            group: 'Отступы',
            responsive: true,
        },
        {
            name: 'borderRadius',
            type: 'number',
            label: 'Скругление углов (rem)',
            default: 0,
            min: 0,
            step: 0.2,
            responsive: true,
        },
        {
            name: 'minHeight',
            type: 'number',
            label: 'Мин. высота (rem)',
            default: 0,
            min: 0,
            step: 0.2,
            description: 'Минимальная высота секции (0 = по контенту)',
            responsive: true,
        },
    ],
};
