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

export interface IBrickDataSource {
    key: string;
    url: string;
    method?: string;
    params?: Record<string, IBrickDataSourceParam>;
    props: string[];
    map?: (response: unknown, context: IBrickDataSourceContext) => Record<string, unknown>;
}
