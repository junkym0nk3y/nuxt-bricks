/**
 * Writes the map of per-device overrides into the props of a component, dropping the
 * key entirely when nothing is left in it.
 *
 * An empty `responsive` is never left behind as a stub: otherwise the serialized
 * schema piles up a `responsive: {}` on every block ever touched.
 *
 * The key is overwritten rather than removed and re-added, and that is deliberate:
 * assigning an existing key keeps its POSITION in the object, while a
 * `const { responsive: _dropped, ...rest }` would move it to the end. Snapshots of
 * the draft are compared as `JSON.stringify` (`publish/utils/draftSnapshots`), so a
 * reordered key turns two semantically equal schemas into different ones and marks a
 * clean draft dirty.
 *
 * `delete` runs on a local copy, before anything is assigned into the reactive state.
 *
 * @param props - Current props of the component.
 * @param responsive - The map of per-device overrides to write.
 * @returns A new props object carrying the map, or none at all when it is empty.
 */
export function withResponsiveProps(
    props: Record<string, unknown>,
    responsive: Record<string, unknown>
): Record<string, unknown> {
    const nextProps = { ...props };

    if (Object.keys(responsive).length > 0) {
        nextProps.responsive = responsive;
    } else {
        delete nextProps.responsive;
    }

    return nextProps;
}
