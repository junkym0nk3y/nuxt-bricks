// Types
import type { IBlockDefinition } from '../types/registry';

/**
 * Definition блока Svg: inline-SVG с перекраской.
 * svgContent заполняется через svgContentProperty при выборе из галереи — в extraDefaults.
 */
export const blockSvgDefinition: IBlockDefinition = {
    name: 'Svg',
    description: 'SVG-блок с настройкой цвета и размера.',
    thumbnail: '/images/layouts/svg.svg',
    responsiveMode: 'all',
    extraDefaults: {
        svgContent: '',
    },
    properties: [
        {
            name: 'src',
            type: 'image',
            label: 'SVG изображение',
            default: '',
            description: 'Выберите SVG из медиа-галереи',
            svgContentProperty: 'svgContent',
        },
        {
            name: 'color',
            type: 'color',
            label: 'Цвет',
            default: '',
            description: 'Применяется к fill/stroke SVG (пустое = оригинальные цвета)',
        },
        {
            name: 'width',
            type: 'input',
            label: 'Ширина',
            default: '4.8rem',
            unit: 'rem',
            description: 'rem или CSS value (например, 4.8rem, 100%, auto)',
        },
        {
            name: 'height',
            type: 'input',
            label: 'Высота',
            default: '4.8rem',
            unit: 'rem',
            description: 'rem или CSS value',
        },
        {
            name: 'alignment',
            type: 'select',
            label: 'Выравнивание',
            default: 'left',
            options: [
                { label: 'Слева', value: 'left' },
                { label: 'По центру', value: 'center' },
                { label: 'Справа', value: 'right' },
            ],
        },
        {
            name: 'marginTop',
            type: 'number',
            label: 'Margin Top (rem)',
            default: 0,
            min: 0,
            step: 0.2,
        },
        {
            name: 'marginBottom',
            type: 'number',
            label: 'Margin Bottom (rem)',
            default: 0,
            min: 0,
            step: 0.2,
        },
    ],
};
