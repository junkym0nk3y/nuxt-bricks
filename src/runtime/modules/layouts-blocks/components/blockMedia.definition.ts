// Types
import type { IBlockDefinition } from '../types/registry';

/**
 * Definition блока Media: изображение/видео.
 * Видео-флаги вне панели свойств — в extraDefaults.
 */
export const blockMediaDefinition: IBlockDefinition = {
    name: 'Media',
    description: 'Медиа-блок (изображение или видео) с настройками отображения.',
    thumbnail: '/images/layouts/media.svg',
    responsiveMode: 'all',
    extraDefaults: {
        autoplay: false,
        loop: false,
        muted: true,
        controls: true,
    },
    properties: [
        {
            name: 'type',
            type: 'select',
            label: 'Тип медиа',
            default: 'image',
            options: [
                { label: 'Изображение', value: 'image' },
                { label: 'Видео', value: 'video' },
            ],
        },
        {
            name: 'src',
            type: 'image',
            label: 'Источник',
            default: '',
        },
        {
            name: 'alt',
            type: 'input',
            label: 'Alt текст',
            default: 'Media',
        },
        {
            name: 'objectFit',
            type: 'select',
            label: 'Заполнение',
            default: 'cover',
            options: [
                { label: 'Вписать', value: 'contain' },
                { label: 'Заполнить', value: 'cover' },
                { label: 'Растянуть', value: 'fill' },
                { label: 'Без масштаба', value: 'none' },
                { label: 'Уменьшить', value: 'scale-down' },
            ],
        },
        {
            name: 'width',
            type: 'input',
            label: 'Ширина',
            default: '100%',
            unit: 'rem',
            description: 'Ширина (rem, %, auto)',
            group: 'Размеры',
            responsive: true,
        },
        {
            name: 'height',
            type: 'input',
            label: 'Высота',
            default: 'auto',
            unit: 'rem',
            description: 'Высота (rem, %, auto)',
            group: 'Размеры',
            responsive: true,
        },
        {
            name: 'borderRadius',
            type: 'input',
            label: 'Скругление углов',
            default: '0',
            unit: 'rem',
            description: 'Скругление углов (rem)',
            group: 'Размеры',
            responsive: true,
        },
    ],
};
