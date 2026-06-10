// TODO(persistence, Шаг 6): переедет в runtime/persistence/ при введении StorageAdapter/PublishAdapter
import type { LandingSchema } from './landing';

/**
 * Формат данных для фронтенда.
 * БД возвращает snake_case, но Vue автоматически конвертирует в camelCase.
 */
export interface ILandingPageRow {
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
    schema: LandingSchema;
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
    schema: LandingSchema;
    published: boolean;
    createdAt: string;
    updatedAt: string;
    isPreview?: boolean;
}

export interface IPublishedLandingPageSummary {
    id: number;
    pagename: string;
    published: boolean;
    urlPrefix: string | null;
    subdomain: string | null;
}

export interface ICreateLandingPayload {
    pagename: string;
    title?: string;
    description?: string;
    keywords?: string;
    socialImage?: string | null;
    layout?: string | null;
    backgroundColor?: string | null;
    urlPrefix?: string | null;
    subdomain?: string | null;
    schema: LandingSchema;
    published?: boolean;
}

export interface IUpdateLandingPayload {
    pagename?: string;
    title?: string;
    description?: string;
    keywords?: string;
    socialImage?: string | null;
    layout?: string | null;
    backgroundColor?: string | null;
    urlPrefix?: string | null;
    subdomain?: string | null;
    schema?: LandingSchema;
    published?: boolean;
}

export interface IUpdateLandingResult {
    id: number;
    pagename: string;
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
