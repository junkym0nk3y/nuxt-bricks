// #region Imports
// Types
import type { IComponentLibraryItem } from '../../../common/types/brick';
import type { IBrickManifestEntry } from '../../../common/types/brickManifest';

// Utils
import { toSafeRecord } from '../../../common/utils/safeRecord';
// #endregion

/**
 * Turns a manifest entry into a card of the library.
 *
 * The metadata arrives ready: `values` and `slots` are parsed at build time, so
 * the card is assembled without importing the brick module — that is, without the
 * Vue component and its styles, which a brick file pulls in with its own import.
 *
 * @param entry - Entry of the brick component manifest.
 * @returns Item of the component library.
 */
export function toComponentLibraryItem(entry: IBrickManifestEntry): IComponentLibraryItem {
    return {
        name: entry.name,
        category: entry.category,
        brickPath: entry.brickPath,
        description: entry.description,
        thumbnail: '',
        // The prop names come out of a brick file: `acc['__proto__'] = …` would
        // replace the prototype of the accumulator instead of writing a key, and
        // an own `__proto__` key would not survive the Nuxt payload
        defaultProps: toSafeRecord(
            Object.entries(entry.values).map(([name, value]) => [name, value.default])
        ),
        slots: entry.slots,
    };
}
