// Types
import type { IBlockDefinition } from '../types/registry';

/**
 * Definition блока Grid: сетка-контейнер с children в default slot.
 */
export const blockGridDefinition: IBlockDefinition = {
    name: 'Grid',
    description: 'Сетка для размещения компонентов по колонкам и строкам.',
    thumbnail: '/images/layouts/grid.svg',
    hasChildren: true,
    responsiveMode: 'all',
    properties: [
        {
            name: 'columns',
            type: 'number',
            label: 'Колонки',
            default: 4,
            min: 1,
            description: 'Количество колонок в сетке (1-12)',
        },
        {
            name: 'rows',
            type: 'number',
            label: 'Строки',
            default: 1,
            min: 1,
            description: 'Количество строк в сетке',
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
            name: 'variant',
            type: 'select',
            label: 'Вариант Bento',
            default: 'default',
            description: 'Предустановленные варианты расположения элементов',
            options: [
                { label: 'По умолчанию', value: 'default' },
                { label: 'Ведущий слева', value: 'lead-left' },
                { label: 'Ведущий справа', value: 'lead-right' },
            ],
        },
        {
            name: 'rowHeight',
            type: 'select',
            label: 'Высота строки',
            default: 'auto',
            description: 'Режим высоты строк грида',
            options: [
                { label: 'Авто (по контенту)', value: 'auto' },
                { label: 'Равные строки (1fr)', value: '1fr' },
                { label: 'Минимум контента', value: 'min-content' },
                { label: 'Максимум контента', value: 'max-content' },
            ],
        },
        {
            name: 'minRowHeight',
            type: 'number',
            label: 'Мин. высота строки (rem)',
            default: 0,
            min: 0,
            description: 'Минимальная высота строки в rem (0 = без ограничения)',
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
