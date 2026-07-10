// Types
import type { ILayoutProperty } from '../../common/types/layoutProperty';
import type { IBlockDefinition } from '../types/registry';

/**
 * Резолвит пропсы блока для published-рендера: дефолты definition
 * (properties[].default + extraDefaults) перекрываются значениями из схемы.
 * Страницы, сохранённые до добавления новых свойств блока, получают их дефолты,
 * а результат честно удовлетворяет полному интерфейсу props блока.
 *
 * @param definition - Definition блока (источник дефолтов).
 * @param componentProps - Пропсы компонента из схемы страницы.
 * @returns Полные пропсы блока.
 */
export function resolvePublishedProps<T>(
    definition: Pick<IBlockDefinition, 'properties' | 'extraDefaults'>,
    componentProps: Record<string, unknown>
): T {
    const defaults = definition.properties.reduce<Record<string, unknown>>(
        (acc, property: ILayoutProperty) => {
            acc[property.name] = property.default;
            return acc;
        },
        {}
    );

    return { ...defaults, ...definition.extraDefaults, ...componentProps } as T;
}
