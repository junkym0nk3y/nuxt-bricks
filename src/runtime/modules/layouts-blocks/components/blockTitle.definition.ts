// Types
import type { IBlockDefinition } from '../types/registry';

// Utils
import { createInlineTextSegment } from '../utils/inlineContent';

/**
 * Definition блока Title: заголовок с inline-контентом.
 * properties — функция: опции fontFamily зависят от runtime availableFonts.
 * Дефолт `marginBottom: 0` — по поведению создания (сверка дефолтов, Часть B).
 */
export const blockTitleDefinition: IBlockDefinition = {
    name: 'Title',
    description: 'Заголовок с поддержкой inline-контента (текст/медиа).',
    thumbnail: '/images/layouts/title.svg',
    responsiveMode: 'none',
    properties: ({ availableFonts }) => [
        {
            name: 'inlineContent',
            type: 'inline-content',
            label: 'Inline Content',
            default: [createInlineTextSegment('Текст заголовка')],
            description: 'Добавьте текстовые и медиа элементы внутри заголовка',
        },
        {
            name: 'headingType',
            type: 'select',
            label: 'Heading Type',
            default: 'h2',
            options: [
                { label: 'H1', value: 'h1' },
                { label: 'H2', value: 'h2' },
                { label: 'H3', value: 'h3' },
                { label: 'H4', value: 'h4' },
                { label: 'H5', value: 'h5' },
                { label: 'H6', value: 'h6' },
            ],
        },
        {
            name: 'fontFamily',
            type: 'select',
            label: 'Font Family',
            default: '',
            options: [
                { label: 'По-умолчанию', value: '' },
                ...availableFonts.map((font: string) => ({ label: font, value: font })),
            ],
        },
        {
            name: 'fontWeight',
            type: 'select',
            label: 'Font Weight',
            default: 600,
            options: [
                { label: '100 (Thin)', value: 100 },
                { label: '200 (Extra Light)', value: 200 },
                { label: '300 (Light)', value: 300 },
                { label: '400 (Regular)', value: 400 },
                { label: '500 (Medium)', value: 500 },
                { label: '600 (Semi Bold)', value: 600 },
                { label: '700 (Bold)', value: 700 },
                { label: '800 (Extra Bold)', value: 800 },
                { label: '900 (Black)', value: 900 },
            ],
        },
        {
            name: 'textAlign',
            type: 'select',
            label: 'Text Align',
            default: 'left',
            options: [
                { label: 'Left', value: 'left' },
                { label: 'Center', value: 'center' },
                { label: 'Right', value: 'right' },
            ],
        },
        {
            name: 'fontSize',
            type: 'number',
            label: 'Font Size (rem)',
            default: 0,
            min: 0,
            step: 0.2,
        },
        {
            name: 'lineHeight',
            type: 'number',
            label: 'Line Height',
            default: 0,
            min: 0,
            step: 0.1,
            description: 'Межстрочный интервал (0 = по-умолчанию 1.2)',
        },
        {
            name: 'letterSpacing',
            type: 'select',
            label: 'Letter Spacing',
            default: '',
            description: 'Межбуквенный интервал',
            options: [
                { label: 'Обычный', value: '' },
                { label: '-0.2rem', value: '-0.2rem' },
                { label: '-0.1rem', value: '-0.1rem' },
                { label: '0rem', value: '0rem' },
                { label: '0.05rem', value: '0.05rem' },
                { label: '0.1rem', value: '0.1rem' },
                { label: '0.15rem', value: '0.15rem' },
                { label: '0.2rem', value: '0.2rem' },
                { label: '0.25rem', value: '0.25rem' },
                { label: '0.3rem', value: '0.3rem' },
                { label: '0.4rem', value: '0.4rem' },
                { label: '0.5rem', value: '0.5rem' },
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
