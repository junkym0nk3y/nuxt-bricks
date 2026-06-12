import type { BricksSchema } from './brick';

/**
 * Формат данных для фронтенда.
 * БД возвращает snake_case, но Vue автоматически конвертирует в camelCase.
 */
export interface IBricksPageRow {
    id: number;
    pagename: string;
    title: string | null;
    description: string | null;
    keywords: string | null;
    backgroundColor: string | null;
    layout: string | null;
    socialImage: string | null;
    urlPrefix: string | null;
    subdomain: string | null;
    schema: BricksSchema;
    published: boolean;
    createdAt: string;
    updatedAt: string;
}

/**
 * Формат данных для фронтенда (плоская структура без settings).
 */
export interface IPublishedPage {
    id: number;
    pagename: string;
    title: string | null;
    description: string | null;
    keywords: string | null;
    backgroundColor: string | null;
    layout: string | null;
    socialImage: string | null;
    urlPrefix: string | null;
    subdomain: string | null;
    schema: BricksSchema;
    published: boolean;
    createdAt: string;
    updatedAt: string;
    isPreview?: boolean;
}

export interface IPublishedPageSummary {
    id: number;
    pagename: string;
    published: boolean;
    urlPrefix: string | null;
    subdomain: string | null;
}

export interface ICreatePagePayload {
    pagename: string;
    title?: string | null;
    description?: string | null;
    keywords?: string | null;
    socialImage?: string | null;
    layout?: string | null;
    backgroundColor?: string | null;
    urlPrefix?: string | null;
    subdomain?: string | null;
    schema: BricksSchema;
    published?: boolean;
}

export interface IUpdatePagePayload {
    pagename?: string;
    title?: string;
    description?: string;
    keywords?: string;
    socialImage?: string | null;
    layout?: string | null;
    backgroundColor?: string | null;
    urlPrefix?: string | null;
    subdomain?: string | null;
    schema?: BricksSchema;
    published?: boolean;
}

/**
 * Данные формы публикации (без schema).
 */
export type TPublishFormState = Omit<IPublishedPage, 'id' | 'schema' | 'isPreview'>;

export type TRequestErrorLike = {
    data?: {
        message?: string;
        code?: string | number;
        statusCode?: number;
    };
    message?: string;
    code?: string | number;
    statusCode?: number;
};
