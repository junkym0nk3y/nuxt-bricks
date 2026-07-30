/**
 * Build-time заполнение runtimeConfig модуля (вынесено из module.ts —
 * см. module-setup.ts для остальных setup-хелперов).
 */

import { defu } from 'defu';
import type { IBricksRoutePrefixes } from './runtime/modules/common/utils/bricks/routePaths';
import { resolveBricksBackendConfig } from './module-backend-config';
import type { IBricksModuleOptions } from './types/module';
import type { IBricksBackendResolution } from './types/moduleBackendConfig';

// #region Helpers
/**
 * Логирует разрешённый режим data backend при старте модуля — только сам mode,
 * без URL и секретов. При наличии ошибок mode не логируется: module.ts валит
 * сборку сразу после (fail-fast), диагностика уходит в текст ошибки.
 *
 * @param resolution - Результат резолвера backend.mode.
 */
function logBackendResolution(resolution: IBricksBackendResolution): void {
    if (resolution.errors.length === 0) {
        const modeLabel =
            resolution.mode === 'external'
                ? 'external (HTTP storage adapter)'
                : 'builtin (local PostgreSQL adapter)';
        console.info(`[nuxt-bricks] Backend mode: ${modeLabel}`);
    }

    for (const warning of resolution.warnings) {
        console.warn(`[nuxt-bricks] ${warning}`);
    }
}

/**
 * Логирует выбранный auth-режим при старте модуля.
 *
 * @param mode - Режим авторизации ('basic' | 'database').
 * @param hasDatabase - Сконфигурирована ли локальная БД.
 */
function logAuthMode(mode: string, hasDatabase: boolean): void {
    if (mode === 'database') {
        console.info('[nuxt-bricks] Auth: database mode (users/sessions in PostgreSQL)');

        if (!hasDatabase) {
            console.warn(
                '[nuxt-bricks] bricks.auth.mode = "database", но bricks.database.url не задан — защищённые пути будут отвечать 503'
            );
        }

        return;
    }

    console.info('[nuxt-bricks] Auth: basic mode (HTTP Basic Auth)');
}

/**
 * Заполняет runtimeConfig persistence-слоя: PostgreSQL, версионирование страниц, S3
 * (server-only, секреты не в public).
 *
 * @param runtimeConfig - nuxt.options.runtimeConfig.
 * @param options - Опции модуля из nuxt.config.
 */
function applyBricksPersistenceRuntimeConfig(
    runtimeConfig: Record<string, unknown>,
    options: IBricksModuleOptions
): void {
    runtimeConfig.bricksDatabaseUrl =
        runtimeConfig.bricksDatabaseUrl ??
        process.env.NUXT_BRICKS_DATABASE_URL ??
        options.database?.url ??
        '';

    // Серверный лимит исполнения одного statement: освобождает соединение пула,
    // чего клиентский потолок ожидания сделать не может. Имя ключа
    // NUXT_BRICKS_DATABASE_STATEMENT_TIMEOUT_MS даёт runtime-override без ребилда
    runtimeConfig.bricksDatabaseStatementTimeoutMs =
        runtimeConfig.bricksDatabaseStatementTimeoutMs ??
        process.env.NUXT_BRICKS_DATABASE_STATEMENT_TIMEOUT_MS ??
        options.database?.statementTimeoutMs;

    // Версионирование страниц: глубина истории снапшотов (0 — выкл).
    // Имя ключа NUXT_BRICKS_VERSIONS_LIMIT даёт runtime-override в проде без ребилда.
    runtimeConfig.bricksVersionsLimit =
        runtimeConfig.bricksVersionsLimit ??
        process.env.NUXT_BRICKS_VERSIONS_LIMIT ??
        options.versionsLimit;

    // Секреты и bucket приходят через NUXT_BRICKS_S3_* (runtime-override Nitro)
    // или options.s3 — build-time env-fallback'ов нет
    runtimeConfig.bricksS3 = defu(runtimeConfig.bricksS3 as object | undefined, options.s3, {
        endpoint: 'https://storage.yandexcloud.net',
        region: 'ru-central1',
        bucket: '',
        accessKeyId: '',
        secretAccessKey: '',
        prefix: 'bricks-media/',
        thumbnailsPrefix: 'bricks-thumbnails/',
    });
}

/**
 * Заполняет runtimeConfig external data backend: base URL, Bearer-токен и
 * health URL (все — server-only, в client payload не попадают; browser ходит
 * через локальный /api/bricks). Сам `mode` — build-time (резолвится отдельно,
 * см. applyBricksRuntimeConfig), а URL/токен runtime-переопределяемы через
 * Nuxt-конвенцию NUXT_BRICKS_BACKEND_URL / _TOKEN / _HEALTH_URL.
 *
 * @param runtimeConfig - nuxt.options.runtimeConfig.
 * @param options - Опции модуля из nuxt.config.
 */
function applyBricksBackendRuntimeConfig(
    runtimeConfig: Record<string, unknown>,
    options: IBricksModuleOptions
): void {
    runtimeConfig.bricksBackendUrl =
        runtimeConfig.bricksBackendUrl ??
        process.env.NUXT_BRICKS_BACKEND_URL ??
        options.backend?.url ??
        '';
    // Токен — только env: секретам не место в nuxt.config
    runtimeConfig.bricksBackendToken =
        runtimeConfig.bricksBackendToken ?? process.env.NUXT_BRICKS_BACKEND_TOKEN ?? '';
    runtimeConfig.bricksBackendHealthUrl =
        runtimeConfig.bricksBackendHealthUrl ??
        process.env.NUXT_BRICKS_BACKEND_HEALTH_URL ??
        options.backend?.healthUrl ??
        '';
}

/**
 * Заполняет runtimeConfig dev-проксирования не-bricks /api/* (PROXY_URL). Ключ
 * server-only: адрес backend не светится в client payload, клиент ходит через
 * proxy middleware. Runtime-override: NUXT_BRICKS_PROXY_URL.
 *
 * @param runtimeConfig - nuxt.options.runtimeConfig.
 * @param options - Опции модуля из nuxt.config.
 */
function applyBricksProxyRuntimeConfig(
    runtimeConfig: Record<string, unknown>,
    options: IBricksModuleOptions
): void {
    runtimeConfig.bricksProxyUrl =
        runtimeConfig.bricksProxyUrl ?? options.proxy?.url ?? process.env.PROXY_URL ?? '';
}

/**
 * Заполняет runtimeConfig auth-режима: server-ключи + публичный флаг для
 * 401-интерцептора и login-страницы.
 * Runtime-нюанс: NUXT_BRICKS_AUTH_MODE переопределяет только server-ключ,
 * для клиента нужен и NUXT_PUBLIC_BRICKS_AUTH_MODE.
 *
 * @param runtimeConfig - nuxt.options.runtimeConfig.
 * @param publicConfig - runtimeConfig.public.
 * @param options - Опции модуля из nuxt.config.
 */
function applyBricksAuthRuntimeConfig(
    runtimeConfig: Record<string, unknown>,
    publicConfig: Record<string, unknown>,
    options: IBricksModuleOptions
): void {
    runtimeConfig.bricksAuthMode =
        runtimeConfig.bricksAuthMode ?? process.env.BRICKS_AUTH_MODE ?? options.auth?.mode;
    runtimeConfig.bricksAuthSessionMaxAge =
        runtimeConfig.bricksAuthSessionMaxAge ??
        process.env.BRICKS_AUTH_SESSION_MAX_AGE ??
        options.auth?.sessionMaxAgeSeconds;

    // Публичный флаг auth-режима (не секрет) — клиенту нужен для редиректа на login
    publicConfig.bricksAuthMode = publicConfig.bricksAuthMode ?? runtimeConfig.bricksAuthMode;
}
// #endregion

/**
 * Заполняет runtimeConfig модуля: basic-auth, persistence (Postgres/S3),
 * external backend, dev proxy, префиксы маршрутов, политика data sources.
 * Дефолты переопределяемы в production через ENV (NUXT_BRICKS_*),
 * кроме bricksRoutes — пути страниц фиксируются на сборке
 * (env-override дал бы рассинхрон с маршрутами). Режим backend в runtimeConfig
 * НЕ хранится вовсе: ключ был бы переопределяем NUXT_BRICKS_BACKEND_MODE в
 * обход build-time валидации — носитель режима — регистрация Nitro-плагина
 * externalBackendStorage в module.ts.
 *
 * @param runtimeConfig - nuxt.options.runtimeConfig.
 * @param options - Опции модуля из nuxt.config.
 * @param routePrefixes - Валидированные префиксы маршрутов.
 * @returns Результат резолвера backend.mode — module.ts валит сборку при errors.
 */
export function applyBricksRuntimeConfig(
    runtimeConfig: Record<string, unknown>,
    options: IBricksModuleOptions,
    routePrefixes: IBricksRoutePrefixes
): IBricksBackendResolution {
    runtimeConfig.basicAuthUsername =
        runtimeConfig.basicAuthUsername ??
        process.env.BASIC_AUTH_USERNAME ??
        options.basicAuth?.username;
    runtimeConfig.basicAuthPassword =
        runtimeConfig.basicAuthPassword ??
        process.env.BASIC_AUTH_PASSWORD ??
        options.basicAuth?.password;

    applyBricksPersistenceRuntimeConfig(runtimeConfig, options);
    applyBricksBackendRuntimeConfig(runtimeConfig, options);
    applyBricksProxyRuntimeConfig(runtimeConfig, options);

    // Доверие x-forwarded-for для клиентского IP rate limiter'ов (server-only;
    // имя ключа NUXT_BRICKS_TRUST_PROXY даёт runtime-override без ребилда)
    runtimeConfig.bricksTrustProxy =
        runtimeConfig.bricksTrustProxy ??
        process.env.NUXT_BRICKS_TRUST_PROXY ??
        options.trustProxy ??
        false;

    const publicConfig = (runtimeConfig.public ?? {}) as Record<string, unknown>;
    runtimeConfig.public = publicConfig;

    // Единый источник префиксов для клиента и auth-матрицы (build-time)
    publicConfig.bricksRoutes = routePrefixes;

    // Политика data sources (public: рендерер выполняет их и на клиенте —
    // preview/refresh; секретов нет). Дефолты числовых значений — в
    // render/utils/dataSourcePolicy.ts (композабл подставляет их сам).
    publicConfig.bricksDataSources = defu(
        publicConfig.bricksDataSources as object | undefined,
        options.dataSources,
        { allowedHosts: [] }
    );

    applyBricksAuthRuntimeConfig(runtimeConfig, publicConfig, options);

    // Режим data backend — build-time: резолвится по сведённым options+env;
    // в runtimeConfig НЕ пишется (см. JSDoc выше) — module.ts превращает
    // резолюцию в регистрацию Nitro-плагинов
    const backendResolution = resolveBricksBackendConfig({
        configuredMode: options.backend?.mode,
        backendUrl: runtimeConfig.bricksBackendUrl as string,
        databaseUrl: runtimeConfig.bricksDatabaseUrl as string,
        authMode: runtimeConfig.bricksAuthMode as string,
    });

    logBackendResolution(backendResolution);
    logAuthMode(runtimeConfig.bricksAuthMode as string, Boolean(runtimeConfig.bricksDatabaseUrl));

    return backendResolution;
}
