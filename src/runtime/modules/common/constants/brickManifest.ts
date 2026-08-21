/**
 * Transport of the brick component manifest. The constants are shared by the
 * build-time generator (`src/bricks-manifest.ts`) and the server-side reader
 * (`server/utils/bricksComponents.ts`) — both sides have to agree on the baseName
 * of the Nitro server asset and on the file name.
 */

/**
 * Subdirectory of the manifest inside `nuxt.options.buildDir`.
 *
 * The name matches the namespace deliberately: nitro scans the directory
 * recursively and without filtering by name, so any foreign file landing here would
 * become a key of our server asset — up to substituting `manifest.json`. `buildDir`
 * is shared by Nuxt and by every module, so the directory, like the namespace, is
 * held under the name of the package.
 */
export const BRICKS_MANIFEST_DIR = 'nuxt-bricks-manifest';

/**
 * baseName of the Nitro server asset — the `assets:<baseName>` storage key.
 * In dev the directory is mounted by the fs driver (the manifest is re-read from
 * disk), in prod its content is baked into the server bundle.
 *
 * The namespace is qualified with the package name because it is shared by the whole
 * application: `serverAssets` is a flat list, and when a baseName coincides with an
 * entry of the consumer or of another module, dev and prod diverge in behavior. In
 * dev nitro mounts every entry separately, and the unstorage `mount` on an occupied
 * base throws `already mounted at ${base}` (the colon in the message is part of the
 * normalized base) — and it does so at the top level of the Nitro module, so **any**
 * request answers a 500 (verified). In prod the `baseName + '/' + file` keys merge
 * file by file, and the collision goes unnoticed. A coincidence on the common word
 * `bricks` is far too likely; the package name rules it out, although nothing stops
 * a consumer from taking exactly `nuxt-bricks-manifest`.
 */
export const BRICKS_MANIFEST_ASSET_BASE = 'nuxt-bricks-manifest';

/** File name of the manifest inside the directory */
export const BRICKS_MANIFEST_FILENAME = 'manifest.json';
