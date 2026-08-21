/**
 * The build-time slot of the storage adapter's default factory.
 *
 * Filled ONLY by the Nitro plugin module.ts registers under
 * `bricks.backend.mode = 'external'` (server/plugins/externalBackendStorage.ts).
 * The mode itself is not stored in runtimeConfig — the key would be overridable by
 * NUXT_BRICKS_BACKEND_MODE, bypassing the build-time validation (database-auth +
 * external); the plugin's registration is by construction immutable after the build.
 *
 * The file is internal: NOT exported from `nuxt-bricks/persistence` — the public path
 * for consumers to swap the adapter remains `setBricksStorageAdapter`.
 */
import type { IStorageAdapter } from '../types/adapters';

let defaultStorageFactory: (() => IStorageAdapter) | null = null;

/**
 * Sets the build-time default factory of the storage adapter (called by the external
 * mode's plugin when Nitro starts).
 *
 * @param factory - The adapter's factory (called lazily on the first access).
 */
export function setBricksDefaultStorageFactory(factory: () => IStorageAdapter): void {
    defaultStorageFactory = factory;
}

/**
 * Returns the build-time default factory of the storage adapter (null — none is set,
 * and the builtin/Postgres default applies).
 *
 * @returns The factory, or null.
 */
export function getBricksDefaultStorageFactory(): (() => IStorageAdapter) | null {
    return defaultStorageFactory;
}
