import type { TPublishFormState } from '../../common/types/landing-api';

export interface ILandDataSourceParam {
    from?: string;
    value?: unknown;
    map?: (value: unknown, context: ILandDataSourceContext) => unknown;
}

export interface ILandDataSourceContext {
    pageSettings: TPublishFormState | null;
    componentProps: Record<string, unknown>;
}

export interface ILandDataSource {
    key: string;
    url: string;
    method?: string;
    params?: Record<string, ILandDataSourceParam>;
    props: string[];
    map?: (response: unknown, context: ILandDataSourceContext) => Record<string, unknown>;
}
