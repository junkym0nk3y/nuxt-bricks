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

/** HTTP-метод data source (контракт Nitro-fetch: оба регистра). */
export type TBrickDataSourceMethod =
    | 'GET'
    | 'POST'
    | 'PUT'
    | 'PATCH'
    | 'DELETE'
    | 'HEAD'
    | 'OPTIONS'
    | 'get'
    | 'post'
    | 'put'
    | 'patch'
    | 'delete'
    | 'head'
    | 'options';

export interface IBrickDataSource {
    key: string;
    url: string;
    method?: TBrickDataSourceMethod;
    params?: Record<string, IBrickDataSourceParam>;
    props: string[];
    map?: (response: unknown, context: IBrickDataSourceContext) => Record<string, unknown>;
}
