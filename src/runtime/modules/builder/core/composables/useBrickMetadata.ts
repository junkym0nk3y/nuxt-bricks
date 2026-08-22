// #region Imports
// Types
import type { IBrickManifestEntry } from '../../../common/types/brickManifest';
import type { IUseBrickMetadataReturn, TBrickMetadataIndex } from '../types/componentLibrary';

// Nuxt
import { useState } from '#imports';

// Utils
import { readOwnKey, toSafeRecord } from '../../../common/utils/safeRecord';
// #endregion

// #region Constants
/**
 * The index lives in application-level state rather than in a module variable: the
 * value travels in the payload and survives hydration, where the `useAsyncData`
 * handler does not run, and on the server it does not leak between requests.
 */
const BRICK_METADATA_STATE_KEY = 'bricks-components-metadata';
// #endregion

/**
 * Metadata of the brick components keyed by `brickPath`: the description, the
 * property definitions and the slots, all of it delivered by the build-time
 * manifest.
 *
 * It replaces the earlier way of getting them — importing the brick module in the
 * browser. That one dragged the Vue component and its styles along, and in dev it
 * lagged by one reload: Vite invalidated the brick file later than the reload signal
 * went out.
 *
 * @returns Replacing the index and reading an entry by path.
 */
export function useBrickMetadata(): IUseBrickMetadataReturn {
    const metadataIndex = useState<TBrickMetadataIndex>(BRICK_METADATA_STATE_KEY, () => ({}));

    /**
     * Replaces the metadata index with the entries of the manifest.
     *
     * @param entries - Entries of the brick component manifest.
     */
    function replaceBrickMetadata(entries: IBrickManifestEntry[]): void {
        // The key comes from the manifest, that is from a file name in the consumer
        // project: `__proto__` in the path would swap the prototype instead of
        // writing a key
        metadataIndex.value = toSafeRecord(entries.map((entry) => [entry.brickPath, entry]));
    }

    /**
     * Reads the metadata of a brick.
     *
     * @param brickPath - Path of the brick file taken from the page schema.
     * @returns The manifest entry, or `undefined` when there is none.
     */
    function readBrickMetadata(brickPath: string): IBrickManifestEntry | undefined {
        return readOwnKey(metadataIndex.value, brickPath);
    }

    return {
        replaceBrickMetadata,
        readBrickMetadata,
    };
}
