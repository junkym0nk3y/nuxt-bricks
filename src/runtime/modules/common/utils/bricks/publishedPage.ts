import type { IBricksSchema } from '../../types/brick';
import type { IPublishedPage } from '../../types/bricks-api';
import { toCamelCase } from '../case-transform';

export const DEFAULT_BACKGROUND_COLOR = '#FFFFFF';
export const DEFAULT_LAYOUT = 'default';

/**
 * Проверяет, что значение похоже на IBricksSchema.
 *
 * @param value - Проверяемое значение.
 */
function isBricksSchema(value: unknown): value is IBricksSchema {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        return false;
    }

    const record = value as Record<string, unknown>;
    return Array.isArray(record.components);
}

/**
 * Нормализует схему: гарантирует наличие components, сохраняет meta если не пуста.
 *
 * @param schema - Схема лендинга.
 * @returns Нормализованная схема.
 */
export function preserveSchema(schema: IBricksSchema | null | undefined): IBricksSchema {
    if (!schema) {
        return { components: [] };
    }

    const result: IBricksSchema = {
        components: schema.components ?? [],
    };

    if (schema.meta && Object.keys(schema.meta).length > 0) {
        result.meta = schema.meta;
    }

    return result;
}

/**
 * Собирает запрошенный urlPrefix из параметра catch-all маршрута published-страницы.
 * У маршрута `bricks-page-prefixed` параметр repeatable (массив сегментов),
 * у `bricks-page` параметра нет вовсе.
 *
 * @param param - Значение `route.params.urlPrefix`.
 * @returns Префикс в виде `a/b/c` или пустая строка.
 */
export function resolveRequestedUrlPrefix(param: unknown): string {
    if (Array.isArray(param)) {
        return param.join('/');
    }

    return typeof param === 'string' ? param : '';
}

/**
 * Проверяет, что страница доступна по запрошенному urlPrefix: страница без
 * префикса — только по голому `/pagename`, страница с префиксом — только по
 * `/prefix/pagename`. Пробельный urlPrefix приравнивается к отсутствию
 * (legacy-записи до server-нормализации ''→null).
 *
 * @param page - Страница (достаточно поля urlPrefix).
 * @param requestedPrefix - Префикс из URL (`resolveRequestedUrlPrefix`).
 * @returns true, если префикс URL соответствует странице.
 */
export function matchesPageUrlPrefix(
    page: Pick<IPublishedPage, 'urlPrefix'>,
    requestedPrefix: string
): boolean {
    return (page.urlPrefix?.trim() ?? '') === requestedPrefix;
}

/**
 * Нормализует ответ API в форму IPublishedPage.
 * Конвертирует snake_case ключи из Django backend в camelCase, но не трогает `schema`
 * (это пользовательский JSON).
 *
 * @param rawPage - Данные страницы из API (может быть в snake_case).
 * @param defaultBackgroundColor - Цвет фона, если страница его не хранит.
 * @returns Нормализованная опубликованная страница в camelCase.
 */
export function normalizePublishedPage(
    rawPage: unknown,
    defaultBackgroundColor: string = DEFAULT_BACKGROUND_COLOR
): IPublishedPage {
    const rawRecord: Record<string, unknown> =
        typeof rawPage === 'object' && rawPage !== null && !Array.isArray(rawPage)
            ? (rawPage as Record<string, unknown>)
            : {};

    const rawSchema = rawRecord.schema;
    const rest: Record<string, unknown> = { ...rawRecord };
    delete rest.schema;

    const page = toCamelCase<Partial<IPublishedPage>>(rest);
    const schema = isBricksSchema(rawSchema) ? rawSchema : { components: [] };

    const createdAt = page.createdAt ?? '';
    const updatedAt = page.updatedAt ?? createdAt;

    return {
        id: page.id as number,
        pagename: page.pagename as string,
        title: page.title ?? '',
        description: page.description ?? '',
        keywords: page.keywords ?? '',
        backgroundColor: page.backgroundColor ?? defaultBackgroundColor,
        layout: page.layout ?? DEFAULT_LAYOUT,
        socialImage: page.socialImage ?? '',
        urlPrefix: page.urlPrefix ?? null,
        subdomain: page.subdomain ?? null,
        thumbnailUrl: page.thumbnailUrl ?? null,
        schema: preserveSchema(schema),
        published: Boolean(page.published),
        // Отсутствует в public-проекции и старых снапшотах — тогда запись без precondition
        revision: typeof page.revision === 'number' ? page.revision : undefined,
        createdAt,
        updatedAt,
        isPreview: page.isPreview,
    };
}
