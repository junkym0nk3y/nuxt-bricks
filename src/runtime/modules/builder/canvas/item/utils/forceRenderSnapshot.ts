// #region Imports
// Utils
import { readOwnKey } from '../../../../common/utils/safeRecord';
// #endregion

/**
 * Snapshot of forceRender prop values for comparison between renders.
 *
 * Serialized as pairs rather than as an object: prop names are declared in the
 * brick file, and a `__proto__` prop creates no own key in a plain object — an
 * edit of it would leave the snapshot unchanged and the forced re-render would
 * never fire. Values are read by own key; otherwise a prop named `toString`
 * would substitute the prototype method for the value from the schema.
 *
 * @param propNames - Names of props with `forceRender: true` from the brick file.
 * @param componentProps - Component props from the page schema.
 * @returns Stable snapshot string (empty when the component has no forceRender props).
 */
export function buildForceRenderSnapshot(
    propNames: string[],
    componentProps: Record<string, unknown>
): string {
    if (propNames.length === 0) {
        return '';
    }

    return JSON.stringify(
        propNames.map((propName) => [propName, readOwnKey(componentProps, propName)])
    );
}
