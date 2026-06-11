/**
 * Типы конфигурации свойств layout-компонентов.
 * Контракт панели свойств: используется builder-ядром, canvas и sidebar;
 * обязателен в common для Части B (layouts-blocks не должен импортировать builder).
 */

import type { IInlineContentSegment } from './content';

export interface ILayoutProperty {
    name: string;
    type:
        | 'number'
        | 'string'
        | 'select'
        | 'boolean'
        | 'textarea'
        | 'input'
        | 'image'
        | 'video'
        | 'inline-content'
        | 'array'
        | 'accordion-items'
        | 'color';
    label: string;
    default: string | number | boolean | IInlineContentSegment[] | Record<string, unknown>[];
    options?: Array<{ label: string; value: string | number }>;
    description?: string;
    min?: number;
    max?: number;
    step?: number;
    /** Имя свойства, куда сохранять svgContent при выборе SVG из галереи */
    svgContentProperty?: string;
    /** Суффикс единицы измерения для инпута (например, 'rem') */
    unit?: string;
    /** Название группы для группировки свойств в сворачиваемый аккордеон */
    group?: string;
    /** Свойство поддерживает адаптивные значения per-breakpoint */
    responsive?: boolean;
}
