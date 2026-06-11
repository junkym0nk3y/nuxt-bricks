/**
 * SQL-фрагменты и билдеры запросов для таблиц bricks_pages / bricks_media.
 * SELECT-поля задают camelCase-алиасы — ответы ручек сразу в формате фронта.
 */
import { toSnakeCaseString } from '../../../common/utils/case-transform';

/**
 * Поля выборки страницы (bricks_pages) с camelCase-алиасами.
 */
export const PAGE_SELECT_FIELDS = `
    id,
    pagename,
    title,
    description,
    keywords,
    social_image as "socialImage",
    layout,
    background_color as "backgroundColor",
    url_prefix as "urlPrefix",
    subdomain,
    schema,
    published,
    created_at as "createdAt",
    updated_at as "updatedAt"
`;

/**
 * Поля выборки медиа (bricks_media) с camelCase-алиасами.
 */
export const MEDIA_SELECT_FIELDS = `
    id,
    url,
    filename,
    alt,
    size::int as size,
    mime_type as "mimeType",
    category,
    svg_content as "svgContent",
    uploaded_at as "uploadedAt"
`;

/**
 * Собирает динамический UPDATE на основе переданных полей (camelCase → snake_case).
 * Поле `schema` сериализуется в JSON для записи в JSONB-колонку.
 *
 * @param body - Объект с изменяемыми полями (camelCase, undefined-поля пропускаются).
 * @returns Массив SET-выражений и массив значений для параметризованного запроса.
 */
export function buildUpdateQuery(body: object): {
    updates: string[];
    values: unknown[];
} {
    const updates: string[] = [];
    const values: unknown[] = [];

    Object.entries(body).forEach(([key, rawValue]) => {
        if (rawValue === undefined) {
            return;
        }

        const column = toSnakeCaseString(key);
        const paramIndex = values.length + 1;
        updates.push(`${column} = $${paramIndex}`);

        if (key === 'schema') {
            values.push(JSON.stringify(rawValue));
            return;
        }

        values.push(rawValue ?? null);
    });

    return { updates, values };
}
