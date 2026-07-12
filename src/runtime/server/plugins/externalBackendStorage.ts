/**
 * Nitro-плагин external-режима data backend.
 *
 * Регистрируется module.ts ТОЛЬКО при build-time `bricks.backend.mode =
 * 'external'` — сама регистрация и есть носитель режима: mode не хранится в
 * runtimeConfig и не может быть переопределён NUXT_-env в обход build-time
 * валидации. Runtime-переопределяемыми остаются только URL/token/healthUrl
 * (NUXT_BRICKS_BACKEND_URL/TOKEN/HEALTH_URL) — они читаются лениво при первом
 * обращении к адаптеру.
 *
 * Кастомный адаптер потребителя (setBricksStorageAdapter из Nitro-плагина)
 * побеждает: он живёт в отдельном слоте registry и проверяется первым.
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
