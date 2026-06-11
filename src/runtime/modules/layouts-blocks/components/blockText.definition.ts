// Types
import type { IBlockDefinition } from '../types/registry';

/**
 * Definition блока Text: HTML-текст.
 * Дефолт content — RU-строка по поведению создания (сверка дефолтов, Часть B).
 */
export const blockTextDefinition: IBlockDefinition = {
    name: 'Text',
    description: 'Текстовый блок с HTML-контентом.',
    thumbnail: '/images/layouts/text.svg',
    responsiveMode: 'none',
    properties: [
        {
            name: 'content',
            type: 'textarea',
            label: 'Content',
            default: '<p>Введите текст</p>',
        },
        {
            name: 'marginTop',
            type: 'number',
            label: 'Margin Top (rem)',
            default: 0,
        },
        {
            name: 'marginBottom',
            type: 'number',
            label: 'Margin Bottom (rem)',
            default: 0,
        },
    ],
};
