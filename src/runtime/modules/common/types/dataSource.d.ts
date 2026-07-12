/**
 * Контракт data sources для brick-компонентов.
 * Определяется в brick (.brick.ts), резолвится рендерером published-страницы.
 */

import type { TPublishFormState } from './bricks-api';

export interface IBrickDataSourceParam {
    from?: string;
    value?: unknown;
    map?: (value: unknown, context: IBrickDataSourceContext) => unknown;
}

export interface IBrickDataSourceContext {
    pageSettings: TPublishFormState | null;
    componentProps: Record<string, unknown>;
}

/**
 * HTTP-метод data source (оба регистра — контракт Nitro-fetch).
 * Только безопасные идемпотентные методы: data source выполняется на каждый
 * SSR/refresh published-страницы — мутирующий запрос здесь был бы побочным
 * эффектом рендера (политика — render/utils/dataSourcePolicy.ts).
 */
export type TBrickDataSourceMethod = 'GET' | 'HEAD' | 'get' | 'head';

/**
 * Публичная runtime-конфигурация data sources
 * (`runtimeConfig.public.bricksDataSources`, источник — `bricks.dataSources`).
 */
export interface IBricksDataSourcesConfig {
    /**
     * Хосты, для которых разрешены абсолютные http(s)-URL data sources.
     * Пусто (дефолт) — разрешены только относительные URL (`/api/...`).
     */
    allowedHosts: string[];
    /** Таймаут одного запроса, мс. */
    timeoutMs: number;
    /** Максимум одновременных запросов data sources на страницу. */
    concurrency: number;
    /** Лимит размера одного ответа, байт (JSON-length approximation). */
    maxResponseBytes: number;
    /** Максимум запросов data sources на один прогон страницы. */
    maxRequestsPerPage: number;
    /** Суммарный wall-clock budget одного прогона, мс (по истечении — abort). */
    totalDeadlineMs: number;
}

export interface IBrickDataSource {
    key: string;
    url: string;
    method?: TBrickDataSourceMethod;
    params?: Record<string, IBrickDataSourceParam>;
    props: string[];
    map?: (response: unknown, context: IBrickDataSourceContext) => Record<string, unknown>;
}
