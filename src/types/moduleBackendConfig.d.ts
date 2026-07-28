/**
 * Контракт резолвера режима data backend (`src/module-backend-config.ts`):
 * вход (опции + env) и результат с диагностикой.
 */

export type TBricksBackendMode = 'builtin' | 'external';

export interface IBricksBackendResolutionInput {
    /** Явный bricks.backend.mode из nuxt.config (build-time, дефолт 'builtin'). */
    configuredMode?: TBricksBackendMode;
    /** Разрешённый base URL external backend (options/env). */
    backendUrl: string;
    /** Разрешённый URL PostgreSQL (options/env). */
    databaseUrl: string;
    /** Режим авторизации ('basic' | 'database'). */
    authMode: string;
}

export interface IBricksBackendResolution {
    /** Итоговый режим: при фатальных ошибках он не применяется — сборка падает. */
    mode: TBricksBackendMode;
    /** Предупреждения (конфигурация подозрительная, но сборка продолжается). */
    warnings: string[];
    /** Фатальные ошибки конфигурации — валят сборку (fail-fast). */
    errors: string[];
}
