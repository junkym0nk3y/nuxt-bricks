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
        createdAt,
        updatedAt,
        isPreview: page.isPreview,
    };
}
