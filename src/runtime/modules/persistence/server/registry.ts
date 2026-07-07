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
import { createS3PublishAdapter } from './s3/s3PublishAdapter';
import type { IStorageAdapter, IPublishAdapter } from '../types/adapters';

let storageAdapter: IStorageAdapter | null = null;
let publishAdapter: IPublishAdapter | null = null;

/**
 * Регистрирует кастомный storage-адаптер вместо дефолтного Postgres.
 *
 * @param adapter - Реализация IStorageAdapter.
 */
export function setBricksStorageAdapter(adapter: IStorageAdapter): void {
    storageAdapter = adapter;
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
