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
    thumbnail_url as "thumbnailUrl",
    schema,
    published,
    revision,
    created_at as "createdAt",
    updated_at as "updatedAt"
`;

/**
 * Поля сводки страницы (bricks_pages) — editorial-список без JSONB schema
 * (тот же паттерн, что VERSION_SUMMARY_FIELDS: список лёгкий, полная строка —
 * point-lookup'ом по id).
 */
export const PAGE_SUMMARY_FIELDS = `
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
    thumbnail_url as "thumbnailUrl",
    published,
    revision,
    created_at as "createdAt",
    updated_at as "updatedAt"
`;

/**
 * Поля сводки версии страницы (bricks_page_versions) — лёгкий список без schema.
 */
export const VERSION_SUMMARY_FIELDS = `
    id,
    page_id as "pageId",
    created_at as "createdAt"
`;

/**
 * Поля полного снапшота версии страницы (bricks_page_versions) с camelCase-алиасами.
 */
export const VERSION_SELECT_FIELDS = `
    id,
    page_id as "pageId",
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
    page_updated_at as "pageUpdatedAt",
    created_at as "createdAt"
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
 * Разрешённые к обновлению поля bricks_pages (camelCase-ключи тела запроса).
 * Имена колонок интерполируются в SET — ключи вне whitelist отбрасываются
 * (защита от SQL-инъекции через имена колонок).
 */
export const PAGE_UPDATE_FIELDS: ReadonlySet<string> = new Set([
    'pagename',
    'title',
    'description',
    'keywords',
    'socialImage',
    'layout',
    'backgroundColor',
    'urlPrefix',
    'subdomain',
    'thumbnailUrl',
    'schema',
    'published',
]);

/**
 * Разрешённые к обновлению поля bricks_media (camelCase-ключи тела запроса).
 */
export const MEDIA_UPDATE_FIELDS: ReadonlySet<string> = new Set(['filename', 'alt', 'category']);

/**
 * Собирает динамический UPDATE на основе переданных полей (camelCase → snake_case).
 * Поле `schema` сериализуется в JSON для записи в JSONB-колонку.
 * Ключи вне `allowedFields` молча отбрасываются — тело запроса приходит от клиента,
 * и без whitelist произвольный ключ попал бы в SET как имя колонки.
 *
 * @param body - Объект с изменяемыми полями (camelCase, undefined-поля пропускаются).
 * @param allowedFields - Whitelist camelCase-ключей, разрешённых для таблицы.
 * @returns Массив SET-выражений и массив значений для параметризованного запроса.
 */
export function buildUpdateQuery(
    body: object,
    allowedFields: ReadonlySet<string>
): {
    updates: string[];
    values: unknown[];
} {
    const updates: string[] = [];
    const values: unknown[] = [];

    Object.entries(body).forEach(([key, rawValue]) => {
        if (rawValue === undefined || !allowedFields.has(key)) {
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

/** Код unique_violation PostgreSQL. */
const UNIQUE_VIOLATION_CODE = '23505';

/**
 * Проверяет, что ошибка — нарушение уникальности PostgreSQL (SQLSTATE 23505).
 * Используется для идемпотентных вставок: гонка «двое вставляют один url»
 * разруливается повторным чтением, а не 500.
 *
 * @param error - Пойманная ошибка запроса.
 * @returns true для unique_violation.
 */
export function isUniqueViolation(error: unknown): boolean {
    return (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        (error as { code?: unknown }).code === UNIQUE_VIOLATION_CODE
    );
}
