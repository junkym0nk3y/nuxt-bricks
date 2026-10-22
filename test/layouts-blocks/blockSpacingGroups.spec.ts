/**
 * The properties panel draws a group of spacing properties with the composite box-model
 * editor only while every property of the group is one of the spacings it knows. A single
 * stranger in the group turns the whole editor back into flat inputs, with nothing failing
 * on the way: that is how a maximum content width placed among the paddings of Section
 * once took the box model away from it.
 */

// #region Imports
// Vitest
import { describe, expect, it } from 'vitest';

// Registry
import { BLOCK_REGISTRY } from '../../src/runtime/modules/layouts-blocks/registry';

// Constants
import { SPACING_PROPERTY_NAMES } from '../../src/runtime/modules/builder/shell/sidebar/components/property-editors/types';
// #endregion

describe('layout blocks: the groups of spacing properties', () => {
    it('hold nothing but the spacings the box-model editor draws', () => {
        const strangers: string[] = [];

        for (const definition of Object.values(BLOCK_REGISTRY)) {
            const groups = new Map<string, typeof definition.properties>();

            for (const property of definition.properties) {
                if (property.group) {
                    groups.set(property.group, [...(groups.get(property.group) ?? []), property]);
                }
            }

            for (const [group, properties] of groups) {
                const isSpacingGroup = properties.some((property) =>
                    SPACING_PROPERTY_NAMES.has(property.name)
                );

                if (!isSpacingGroup) {
                    continue;
                }

                for (const property of properties) {
                    if (property.type !== 'number' || !SPACING_PROPERTY_NAMES.has(property.name)) {
                        strangers.push(`${definition.name} / ${group} / ${property.name}`);
                    }
                }
            }
        }

        expect(strangers).toEqual([]);
    });
});
