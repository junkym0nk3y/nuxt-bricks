// Types
import type { IBlockDefinition } from '../types/registry';

/**
 * Definition блока Flex: flex-контейнер с children в default slot.
 * Дефолт `wrap: false` — по поведению создания (сверка дефолтов, Часть B).
 */
export const blockFlexDefinition: IBlockDefinition = {
    name: 'Flex',
    description: 'Flex-контейнер для горизонтальной или вертикальной раскладки элементов.',
    thumbnail: '/images/layouts/flex.svg',
    hasChildren: true,
    responsiveMode: 'all',
    properties: [
        {
            name: 'direction',
            type: 'select',
            label: 'Направление',
            default: 'row',
            description: 'Направление расположения элементов',
            options: [
                { label: 'Горизонтально', value: 'row' },
                { label: 'Вертикально', value: 'column' },
            ],
        },
        {
            name: 'justify',
            type: 'select',
            label: 'По главной оси',
            default: 'start',
            description: 'Для row: по горизонтали; для column: по вертикали',
            options: [
                { label: 'В начале', value: 'start' },
                { label: 'По центру', value: 'center' },
                { label: 'В конце', value: 'end' },
                { label: 'Равномерно', value: 'space-between' },
                { label: 'С отступами', value: 'space-around' },
            ],
        },
        {
            name: 'align',
            type: 'select',
            label: 'По поперечной оси',
            default: 'stretch',
            description: 'Для row: по вертикали; для column: по горизонтали',
            options: [
                { label: 'Растянуть', value: 'stretch' },
                { label: 'В начале', value: 'start' },
                { label: 'По центру', value: 'center' },
                { label: 'В конце', value: 'end' },
                { label: 'По базовой линии', value: 'baseline' },
            ],
        },
        {
            name: 'gap',
            type: 'number',
            label: 'Отступ',
            default: 24,
            min: 0,
            description: 'Расстояние между элементами в пикселях',
        },
        {
            name: 'wrap',
            type: 'boolean',
            label: 'Перенос строк',
            default: false,
            description: 'Переносить элементы на новую строку при нехватке места',
        },
        {
            name: 'paddingX',
            type: 'number',
            label: 'Padding горизонтальный (rem)',
            default: 0,
            min: 0,
            step: 0.2,
            description: 'Горизонтальный внутренний отступ контейнера в rem',
        },
        {
            name: 'paddingY',
            type: 'number',
            label: 'Padding вертикальный (rem)',
            default: 0,
            min: 0,
            step: 0.2,
            description: 'Вертикальный внутренний отступ контейнера в rem',
        },
    ],
};
