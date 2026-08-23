/**
 * The registry of the persistence adapters (module-scoped singletons).
 *
 * The default storage adapter is chosen by the build-time mode
 * `bricks.backend.mode`: `builtin` → PostgreSQL, `external` → the HTTP adapter over
 * the user's backend. What carries the mode is the registration of the
 * externalBackendStorage Nitro plugin (module.ts), which sets the build-time factory
 * in defaultStorage.ts: runtimeConfig holds no mode, and no NUXT_ env changes it.
 * Publish is S3. Every adapter is created lazily on the first access.
 * A custom adapter is registered by the module's consumer from their own Nitro plugin
 * (server/plugins/*.ts) through the setters before the first request —
 * it beats any mode:
 *
 * ```ts
 * import { setBricksStorageAdapter } from 'nuxt-bricks/persistence';
 *
 * export default defineNitroPlugin(() => {
 *     setBricksStorageAdapter(createMyStorageAdapter());
 * });
 * ```
 */
import { createPostgresStorageAdapter } from './postgres/postgresStorageAdapter';
import { createPostgresAuthAdapter } from './postgres/postgresAuthAdapter';
import { createS3PublishAdapter } from './s3/s3PublishAdapter';
import { getBricksDefaultStorageFactory } from './defaultStorage';
import type { IStorageAdapter, IPublishAdapter } from '../types/adapters';
import type { IAuthAdapter } from '../types/authAdapters';

// The domain errors are part of the IStorageAdapter contract (custom adapters throw
// them out of create*/update*, and the handlers map them onto HTTP statuses).
// BricksStorageWriteRejected reports that the write is guaranteed not to have been
// applied: without it the outcome is treated as unknown, and the owner of the
// uploaded files does not delete them.
export {
    BricksPageAddressConflictError,
    BricksRevisionConflictError,
    BricksStatementTimeoutError,
    BricksStorageWriteRejectedError,
    BricksTemplateNameConflictError,
    BricksUnknownMediaCategoryError,
} from './utils/storageErrors';

// The same for the IAuthAdapter contract: the account handlers tell these refusals
// apart through `instanceof`, so a custom implementation must throw EXACTLY
// these classes — a local class of the same name would give a 500 instead of a 409
// with a machine-readable code. Without the re-export the contract's `@throws`
// requirement would be impossible to satisfy.
//
// CREATING an account is the exception: it does not throw a taken login at all any
// more. It goes through the operation protocol (`createUserForOperation`), where the
// refusal has to be STORED in the operation and returned as `{ status: 'rejected' }`
// — otherwise every repeat of that key would compute the password hash again to
// arrive at the same refusal. `BricksUsernameTakenError` is thrown by the HANDLER out
// of that status; an implementation throwing it from the adapter would be released by
// the handler's catch and would lose the terminal outcome.
export { BricksLastActiveAdminError, BricksUsernameTakenError } from './utils/authErrors';

let storageAdapter: IStorageAdapter | null = null;
let publishAdapter: IPublishAdapter | null = null;
let authAdapter: IAuthAdapter | null = null;
let customStorageAdapterRegistered = false;

/**
 * Registers a custom storage adapter in place of the default Postgres one.
 *
 * @param adapter - An IStorageAdapter implementation.
 */
export function setBricksStorageAdapter(adapter: IStorageAdapter): void {
    storageAdapter = adapter;
    customStorageAdapterRegistered = true;
}

/**
 * Whether a custom storage adapter has been registered (for the readiness probe: a
 * custom adapter defines the checkHealth semantics itself).
 */
export function hasCustomBricksStorageAdapter(): boolean {
    return customStorageAdapterRegistered;
}

/**
 * Creates the default storage adapter: the build-time factory of external mode (set by
 * the externalBackendStorage Nitro plugin at startup — the plugin's registration is
 * itself what carries `bricks.backend.mode`), and without it — PostgreSQL (builtin).
 *
 * @returns The default IStorageAdapter implementation.
 */
function createDefaultStorageAdapter(): IStorageAdapter {
    const factory = getBricksDefaultStorageFactory();

    return factory ? factory() : createPostgresStorageAdapter();
}

/**
 * Returns the active storage adapter, lazily creating the default one by the backend's
 * mode (the custom setter > external → HTTP > builtin → Postgres).
 *
 * @returns The active IStorageAdapter.
 */
export function useBricksStorageAdapter(): IStorageAdapter {
    if (!storageAdapter) {
        storageAdapter = createDefaultStorageAdapter();
    }

    return storageAdapter;
}

/**
 * Registers a custom publish adapter in place of the default S3 one.
 *
 * @param adapter - An IPublishAdapter implementation.
 */
export function setBricksPublishAdapter(adapter: IPublishAdapter): void {
    publishAdapter = adapter;
}

/**
 * Returns the active publish adapter, lazily creating the default S3 one.
 *
 * @returns The active IPublishAdapter.
 */
export function useBricksPublishAdapter(): IPublishAdapter {
    if (!publishAdapter) {
        publishAdapter = createS3PublishAdapter();
    }

    return publishAdapter;
}

/**
 * Registers a custom auth adapter in place of the default Postgres one.
 *
 * @param adapter - An IAuthAdapter implementation.
 */
export function setBricksAuthAdapter(adapter: IAuthAdapter): void {
    authAdapter = adapter;
}

/**
 * Returns the active auth adapter, lazily creating the default Postgres one.
 *
 * @returns The active IAuthAdapter.
 */
export function useBricksAuthAdapter(): IAuthAdapter {
    if (!authAdapter) {
        authAdapter = createPostgresAuthAdapter();
    }

    return authAdapter;
}
