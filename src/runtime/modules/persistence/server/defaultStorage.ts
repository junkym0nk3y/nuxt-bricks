/**
 * Build-time слот дефолтной фабрики storage-адаптера.
 *
 * Заполняется ТОЛЬКО Nitro-плагином, который module.ts регистрирует при
 * `bricks.backend.mode = 'external'` (server/plugins/externalBackendStorage.ts).
 * Сам режим в runtimeConfig не хранится — ключ был бы переопределяем
 * NUXT_BRICKS_BACKEND_MODE в обход build-time валидации (database-auth +
 * external); регистрация плагина по построению неизменяема после сборки.
 *
 * Файл внутренний: НЕ экспортируется из `nuxt-bricks/persistence` — публичный
 * путь подмены адаптера для потребителей остаётся `setBricksStorageAdapter`.
 */
import type { IStorageAdapter } from '../types/adapters';

let defaultStorageFactory: (() => IStorageAdapter) | null = null;

/**
 * Устанавливает build-time дефолтную фабрику storage-адаптера
 * (вызывается плагином external-режима при старте Nitro).
 *
 * @param factory - Фабрика адаптера (вызывается лениво при первом обращении).
 */
export function setBricksDefaultStorageFactory(factory: () => IStorageAdapter): void {
    defaultStorageFactory = factory;
}

/**
 * Возвращает build-time дефолтную фабрику storage-адаптера (null — не задана,
 * действует дефолт builtin/Postgres).
 *
 * @returns Фабрика или null.
 */
export function getBricksDefaultStorageFactory(): (() => IStorageAdapter) | null {
    return defaultStorageFactory;
}
