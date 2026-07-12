/**
 * Реестр persistence-адаптеров (module-scoped синглтоны).
 *
 * Дефолты — Postgres (storage) и S3 (publish), создаются лениво при первом
 * обращении. Кастомный адаптер потребитель модуля регистрирует из своего
 * Nitro-плагина (server/plugins/*.ts) через сеттеры до первого запроса:
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
import type { IStorageAdapter, IPublishAdapter, IAuthAdapter } from '../types/adapters';

// Доменные ошибки конфликтов — часть контракта IStorageAdapter (кастомные
// адаптеры кидают их из createPage/updatePage, ручки маппят на HTTP 409).
export { BricksPagenameConflictError, BricksRevisionConflictError } from './utils/storageErrors';

let storageAdapter: IStorageAdapter | null = null;
let publishAdapter: IPublishAdapter | null = null;
let authAdapter: IAuthAdapter | null = null;
let customStorageAdapterRegistered = false;

/**
 * Регистрирует кастомный storage-адаптер вместо дефолтного Postgres.
 *
 * @param adapter - Реализация IStorageAdapter.
 */
export function setBricksStorageAdapter(adapter: IStorageAdapter): void {
    storageAdapter = adapter;
    customStorageAdapterRegistered = true;
}

/**
 * Зарегистрирован ли кастомный storage-адаптер (для readiness probe:
 * кастомный адаптер сам отвечает за checkHealth-семантику).
 */
export function hasCustomBricksStorageAdapter(): boolean {
    return customStorageAdapterRegistered;
}

/**
 * Возвращает активный storage-адаптер, лениво создавая дефолтный Postgres.
 *
 * @returns Активный IStorageAdapter.
 */
export function useBricksStorageAdapter(): IStorageAdapter {
    if (!storageAdapter) {
        storageAdapter = createPostgresStorageAdapter();
    }

    return storageAdapter;
}

/**
 * Регистрирует кастомный publish-адаптер вместо дефолтного S3.
 *
 * @param adapter - Реализация IPublishAdapter.
 */
export function setBricksPublishAdapter(adapter: IPublishAdapter): void {
    publishAdapter = adapter;
}

/**
 * Возвращает активный publish-адаптер, лениво создавая дефолтный S3.
 *
 * @returns Активный IPublishAdapter.
 */
export function useBricksPublishAdapter(): IPublishAdapter {
    if (!publishAdapter) {
        publishAdapter = createS3PublishAdapter();
    }

    return publishAdapter;
}

/**
 * Регистрирует кастомный auth-адаптер вместо дефолтного Postgres.
 *
 * @param adapter - Реализация IAuthAdapter.
 */
export function setBricksAuthAdapter(adapter: IAuthAdapter): void {
    authAdapter = adapter;
}

/**
 * Возвращает активный auth-адаптер, лениво создавая дефолтный Postgres.
 *
 * @returns Активный IAuthAdapter.
 */
export function useBricksAuthAdapter(): IAuthAdapter {
    if (!authAdapter) {
        authAdapter = createPostgresAuthAdapter();
    }

    return authAdapter;
}
