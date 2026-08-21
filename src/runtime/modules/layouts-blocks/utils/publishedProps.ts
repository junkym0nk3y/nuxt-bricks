// Types
import type { ILayoutProperty } from '../../common/types/layoutProperty';
import type { IBlockDefinition } from '../types/registry';

/**
 * Resolves the props of a block for the published render: the definition defaults
 * (properties[].default plus extraDefaults) are overlaid with the values from the schema.
 * Pages saved before new properties were added to a block get the defaults of those
 * properties, and the result honestly satisfies the full props interface of the block.
 *
 * @param definition - Block definition (the source of the defaults).
 * @param componentProps - Component props out of the page schema.
 * @returns The complete block props.
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
