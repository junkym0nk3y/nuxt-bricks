/**
 * SQL-фрагменты и билдеры запросов для таблиц bricks_pages / bricks_media.
 * SELECT-поля задают camelCase-алиасы — ответы ручек сразу в формате фронта.
 */
import type { IPostgresErrorLike } from '../../types/postgres';
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
 * `thumbnailUrl` и `pageUpdatedAt` входят в сводку: галерея версий рисует по
 * списку и превью, и дату сохранения снятого состояния, а без них на каждую
 * карточку пришлось бы тянуть полный снапшот со schema.
 */
export const VERSION_SUMMARY_FIELDS = `
    id,
    page_id as "pageId",
    thumbnail_url as "thumbnailUrl",
    page_updated_at as "pageUpdatedAt",
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
    thumbnail_url as "thumbnailUrl",
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
    width,
    height,
    preview_url as "previewUrl",
    mock_url as "mockUrl",
    uploaded_at as "uploadedAt"
`;

/**
 * Поля выборки категории медиа (bricks_media_categories) с camelCase-алиасами.
 */
export const MEDIA_CATEGORY_SELECT_FIELDS = `
    id,
    slug,
    label,
    sort_order as "sortOrder"
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

/** Код foreign_key_violation PostgreSQL. */
const FOREIGN_KEY_VIOLATION_CODE = '23503';

/**
 * Достаёт SQLSTATE-код из ошибки драйвера.
 *
 * @param error - Пойманная ошибка запроса.
 * @returns Код или null, если это не ошибка pg с кодом.
 */
export function readSqlStateCode(error: unknown): string | null {
    if (typeof error !== 'object' || error === null) {
        return null;
    }

    const code = (error as IPostgresErrorLike).code;

    return typeof code === 'string' ? code : null;
}

/**
 * Проверяет, что ошибка — нарушение уникальности PostgreSQL (SQLSTATE 23505).
 * Используется для идемпотентных вставок: гонка «двое вставляют один url»
 * разруливается повторным чтением, а не 500.
 *
 * @param error - Пойманная ошибка запроса.
 * @returns true для unique_violation.
 */
export function isUniqueViolation(error: unknown): boolean {
    return readSqlStateCode(error) === UNIQUE_VIOLATION_CODE;
}

/**
 * Достаёт имя нарушенного ограничения из ошибки драйвера.
 *
 * @param error - Пойманная ошибка запроса.
 * @returns Имя ограничения или null.
 */
export function readViolatedConstraint(error: unknown): string | null {
    if (typeof error !== 'object' || error === null) {
        return null;
    }

    const constraint = (error as IPostgresErrorLike).constraint;

    return typeof constraint === 'string' ? constraint : null;
}

/**
 * Проверяет, что ошибка — нарушение внешнего ключа PostgreSQL (SQLSTATE 23503).
 *
 * Различать конкретный констрейнт по имени намеренно не стали: у `bricks_media`
 * внешний ключ ровно один (`category` → `bricks_media_categories.slug`), а имя
 * его в базовой миграции не задано — PostgreSQL генерирует его сам, и опечатка
 * в ожидаемом имени провалила бы распознавание МОЛЧА, вернув ровно тот
 * generic 500, ради которого проверка и заводится. Вызывающий обязан применять
 * её только к записи `bricks_media` и только когда в payload есть ненулевая
 * категория; появится второй внешний ключ — придётся сузить по `constraint`.
 *
 * @param error - Пойманная ошибка запроса.
 * @returns true для foreign_key_violation.
 */
export function isForeignKeyViolation(error: unknown): boolean {
    return readSqlStateCode(error) === FOREIGN_KEY_VIOLATION_CODE;
}
