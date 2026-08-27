// #region Imports
// Types
import type { IBricksComponent, IBricksSchema } from '../../../common/types/brick';

// Utils
import { withResponsiveProps } from './responsiveProps';
// #endregion

/**
 * Takes the overrides and the visibility flags of the removed devices out of a
 * component.
 *
 * @param component - Component of the schema.
 * @param removedKeys - Keys of the devices the set no longer carries.
 * @returns The component without the keys of the removed devices.
 */
function cleanComponent(component: IBricksComponent, removedKeys: Set<string>): IBricksComponent {
    const props = component.props as Record<string, unknown>;
    const responsive = props.responsive;

    let nextProps = props;

    if (responsive && typeof responsive === 'object') {
        const kept = Object.fromEntries(
            Object.entries(responsive as Record<string, unknown>).filter(
                ([key]) => !removedKeys.has(key)
            )
        );

        nextProps = withResponsiveProps(props, kept);
    }

    const visibility = component.deviceVisibility;
    const nextVisibility =
        visibility && Object.keys(visibility).some((key) => removedKeys.has(key))
            ? Object.fromEntries(
                  Object.entries(visibility).filter(([key]) => !removedKeys.has(key))
              )
            : visibility;

    const cleaned: IBricksComponent = { ...component, props: nextProps };

    if (nextVisibility && Object.keys(nextVisibility).length > 0) {
        cleaned.deviceVisibility = nextVisibility;
    } else {
        delete cleaned.deviceVisibility;
    }

    return cleaned;
}

/**
 * Cleans out of a schema everything that belonged to the devices that went away.
 *
 * A pure transform: the same call serves the current schema, a snapshot of the history
 * and the impact preview of a set edit. Why the history is walked at all is at
 * `stripDeviceKeys`.
 *
 * @param schema - Page schema.
 * @param removedKeys - Keys of the devices the set no longer carries.
 * @returns The schema without the keys of the removed devices.
 */
export function stripDeviceKeysFromSchema(
    schema: IBricksSchema,
    removedKeys: ReadonlySet<string>
): IBricksSchema {
    if (removedKeys.size === 0) {
        return schema;
    }

    const keys = new Set(removedKeys);

    return {
        ...schema,
        components: schema.components.map((component) => cleanComponent(component, keys)),
    };
}

/**
 * Works out which device keys went away when the set changed.
 *
 * @param previous - Keys of the previous set.
 * @param next - Keys of the new set.
 * @returns The keys that went away.
 */
export function findRemovedDeviceKeys(
    previous: ReadonlyArray<string>,
    next: ReadonlyArray<string>
): Set<string> {
    const kept = new Set(next);

    return new Set(previous.filter((key) => !kept.has(key)));
}
