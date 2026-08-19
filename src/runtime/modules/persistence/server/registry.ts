/**
 * Реестр persistence-адаптеров (module-scoped синглтоны).
 *
 * Дефолтный storage-адаптер выбирается по build-time режиму
 * `bricks.backend.mode`: `builtin` → PostgreSQL, `external` → HTTP-адаптер
 * поверх пользовательского backend. Носитель режима — регистрация Nitro-плагина
 * externalBackendStorage (module.ts), который ставит build-time фабрику в
 * defaultStorage.ts: в runtimeConfig режима нет, NUXT_-env его не меняет.
 * Publish — S3. Все адаптеры создаются лениво при первом обращении.
 * Кастомный адаптер потребитель модуля регистрирует из своего Nitro-плагина
 * (server/plugins/*.ts) через сеттеры до первого запроса —
 * он побеждает любой режим:
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

// Доменные ошибки — часть контракта IStorageAdapter (кастомные адаптеры кидают
// их из create*/update*, ручки маппят на HTTP-статусы). BricksStorageWriteRejected
// сообщает, что запись гарантированно не применена: без него исход считается
// неизвестным, и владелец загруженных файлов их не удаляет.
export {
    BricksPageAddressConflictError,
    BricksRevisionConflictError,
    BricksStatementTimeoutError,
    BricksStorageWriteRejectedError,
    BricksTemplateNameConflictError,
    BricksUnknownMediaCategoryError,
} from './utils/storageErrors';

// То же для контракта IAuthAdapter: ручки учёток различают эти отказы через
// `instanceof`, поэтому кастомная реализация обязана кидать ИМЕННО эти классы —
// одноимённый локальный класс дал бы 500 вместо 409 с машиночитаемым кодом.
// Без реэкспорта требование `@throws` в контракте было бы невыполнимым.
export { BricksLastActiveAdminError, BricksUsernameTakenError } from './utils/authErrors';

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
 * Создаёт дефолтный storage-адаптер: build-time фабрика external-режима
 * (её ставит Nitro-плагин externalBackendStorage при старте — сама регистрация
 * плагина и есть носитель `bricks.backend.mode`), без неё — PostgreSQL (builtin).
 *
 * @returns Дефолтная реализация IStorageAdapter.
 */
function createDefaultStorageAdapter(): IStorageAdapter {
    const factory = getBricksDefaultStorageFactory();

    return factory ? factory() : createPostgresStorageAdapter();
}

/**
 * Возвращает активный storage-адаптер, лениво создавая дефолтный по режиму
 * backend (custom-сеттер > external → HTTP > builtin → Postgres).
 *
 * @returns Активный IStorageAdapter.
 */
export function useBricksStorageAdapter(): IStorageAdapter {
    if (!storageAdapter) {
        storageAdapter = createDefaultStorageAdapter();
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
