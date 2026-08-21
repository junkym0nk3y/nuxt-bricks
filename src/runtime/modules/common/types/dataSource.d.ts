/**
 * Contract of the data sources of brick components.
 * Declared in a brick (.brick.ts), resolved by the renderer of a published page.
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
 * HTTP method of a data source (both cases — the Nitro fetch contract).
 * Safe idempotent methods only: a data source runs on every SSR and every refresh of
 * a published page — a mutating request here would be a side effect of the render (the
 * policy is in render/utils/dataSourcePolicy.ts).
 */
export type TBrickDataSourceMethod = 'GET' | 'HEAD' | 'get' | 'head';

/**
 * Public runtime configuration of the data sources
 * (`runtimeConfig.public.bricksDataSources`, sourced from `bricks.dataSources`).
 */
export interface IBricksDataSourcesConfig {
    /**
     * Hosts for which absolute http(s) URLs of data sources are allowed.
     * Empty (the default) — only relative URLs are allowed (`/api/...`).
     */
    allowedHosts: string[];
    /** Timeout of a single request, ms */
    timeoutMs: number;
    /** Maximum number of concurrent data source requests per page */
    concurrency: number;
    /** Size limit of a single response, bytes of the transport stream */
    maxResponseBytes: number;
    /** Maximum number of data source requests per page run */
    maxRequestsPerPage: number;
    /** Total wall-clock budget of one run, ms (an abort once it elapses) */
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
