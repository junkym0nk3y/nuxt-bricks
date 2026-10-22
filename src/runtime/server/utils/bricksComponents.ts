import { createError } from 'h3';
import { useStorage } from 'nitropack/runtime';
import {
    BRICKS_MANIFEST_ASSET_BASE,
    BRICKS_MANIFEST_FILENAME,
} from '../../modules/common/constants/brickManifest';
import type { IBricksManifest, TBrickManifestRef } from '../../modules/common/types/brickManifest';

const EMPTY_MANIFEST: IBricksManifest = { bricks: [] };

/**
 * Reads the brick component manifest from the Nitro server assets: in dev the
 * manifest directory is mounted by the fs driver (it is re-read from disk after
 * every edit of a brick file), in prod the contents are baked into the server
 * bundle — so it works out of `.output` without relying on process.cwd().
 *
 * @returns The manifest, or an empty list when the generator has not run yet.
 */
async function readBricksManifest(): Promise<IBricksManifest> {
    const storage = useStorage(`assets:${BRICKS_MANIFEST_ASSET_BASE}`);
    const manifest = await storage.getItem<IBricksManifest>(BRICKS_MANIFEST_FILENAME);

    if (!manifest?.bricks) {
        console.warn('[bricks] component manifest was not generated — the library will be empty');
        return EMPTY_MANIFEST;
    }

    return manifest;
}

/**
 * Returns the whole manifest, or the components of a single category.
 * Throws 404 when the requested category is not in the manifest.
 *
 * The selection is a straight filter rather than a grouping of the whole
 * manifest: exactly one category leaves the handler, and there is no point in
 * building buckets for the rest. It also keeps a category coming from a brick
 * file from becoming an object key — the strings `__proto__` and `constructor`
 * are valid categories, yet on an object they read as members of
 * `Object.prototype` and used to crash the handler.
 *
 * The comparison is case-insensitive on both sides, so `Marketing` and
 * `marketing` count as one category: otherwise the lookup would return the
 * components of whichever of them was encountered first only.
 *
 * @param category - Category name from the request (case does not matter).
 * @returns The manifest, or the component list of the category.
 */
export async function resolveBricksComponents(
    category?: string
): Promise<IBricksManifest | TBrickManifestRef[]> {
    const manifest = await readBricksManifest();

    if (!category) {
        return manifest;
    }

    const wanted = category.toLowerCase();
    const components = manifest.bricks
        .filter((brick) => brick.category.toLowerCase() === wanted)
        .map(({ name, brickPath }) => ({ name, brickPath }));

    if (components.length === 0) {
        // No `data.description` next to the message: the server does not know the
        // language of the interface, so any prose it puts into the body would ship
        // in exactly one of them. The whole error surface of /api/bricks/** is
        // English developer text in `statusMessage`, and this hint belongs there
        // too — a consumer that wants a localized message maps the status itself.
        throw createError({
            statusMessage:
                'Components category not found: no brick files of this category exist in components/',
            statusCode: 404,
        });
    }

    return components;
}
