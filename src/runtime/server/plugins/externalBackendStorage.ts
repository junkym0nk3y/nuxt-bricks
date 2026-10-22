/**
 * Nitro plugin of the external data backend mode.
 *
 * Registered by module.ts ONLY under the build-time `bricks.backend.mode =
 * 'external'` — the registration itself is the carrier of the mode: the mode is
 * not kept in runtimeConfig and cannot be overridden by a NUXT_ env variable
 * around the build-time validation. Only the URL, the token and the healthUrl
 * stay runtime-overridable (NUXT_BRICKS_BACKEND_URL/TOKEN/HEALTH_URL) — they are
 * read lazily on the first call into the adapter.
 *
 * A custom adapter of the consumer (setBricksStorageAdapter from a Nitro plugin)
 * wins: it lives in a separate slot of the registry and is checked first.
 */
import { defineNitroPlugin, useRuntimeConfig } from 'nitropack/runtime';
import { setBricksDefaultStorageFactory } from '../../modules/persistence/server/defaultStorage';
import { createHttpStorageAdapter } from '../../modules/persistence/server/http/httpStorageAdapter';

export default defineNitroPlugin(() => {
    setBricksDefaultStorageFactory(() => {
        const config = useRuntimeConfig();

        return createHttpStorageAdapter({
            baseUrl: (config.bricksBackendUrl as string | undefined) ?? '',
            token: (config.bricksBackendToken as string | undefined) ?? '',
            healthUrl: (config.bricksBackendHealthUrl as string | undefined) ?? '',
        });
    });
});
