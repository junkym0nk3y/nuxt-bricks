/**
 * Типы конфигурации свойств layout-компонентов.
 * Контракт панели свойств: используется builder-ядром, canvas и sidebar;
 * обязателен в common для Части B (layouts-blocks не должен импортировать builder).
 */

import type { IInlineContentSegment } from './content';
import type { IPropertyDefinition } from './brick';

/**
 * Типы редакторов, доступные layout-блокам. Уже́ набора brick-свойств
 * (`TPropertyType`) сознательно: `object`, `readonly` и `switch` в definitions
 * блоков не встречаются, а разрешить их значило бы обещать поведение, которого
 * панель для layout-блоков не даёт.
 */
export type TLayoutPropertyType =
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
    | 'tags'
    | 'image-gallery'
    | 'color';

/**
 * Свойство панели у layout-блока.
 *
 * Выводится из `IPropertyDefinition`, а не объявляется заново: объект долетает
 * до панели структурно (`layoutProperties.ts` — сквозной проброс, мапера между
 * типами нет), поэтому две независимые копии обязаны совпадать поле в поле.
 * Пока они были копиями, это уже разошлось — `tags` и `image-gallery` панель
 * рисовала, а объявить их в definition было нельзя.
 *
 * Отличаются только те три поля, у которых у layout-блоков набор реально уже:
 * тип редактора, форма дефолта и форма опций.
 */
export interface ILayoutProperty extends Omit<IPropertyDefinition, 'type' | 'default' | 'options'> {
    type: TLayoutPropertyType;
    default: string | number | boolean | IInlineContentSegment[] | Record<string, unknown>[];
    options?: Array<{ label: string; value: string | number }>;
}
