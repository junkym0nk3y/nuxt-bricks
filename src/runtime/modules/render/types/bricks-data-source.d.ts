import type { TPublishFormState } from '../../common/types/bricks-api';

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
