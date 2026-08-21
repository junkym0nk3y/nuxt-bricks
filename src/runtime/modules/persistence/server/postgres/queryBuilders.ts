/**
 * SQL-фрагменты и билдеры запросов для таблиц bricks_pages / bricks_media /
 * bricks_templates.
 * SELECT-поля задают camelCase-алиасы — ответы ручек сразу в формате фронта.
 */
import type { IPostgresErrorLike } from '../../types/postgres';
import { toSnakeCaseString } from '../../../common/utils/case-transform';
import {
    BricksPostgresQueryNotStartedError,
    BricksStatementTimeoutError,
} from '../utils/storageErrors';

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
    viewport_config as "viewportConfig",
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
    viewport_config as "viewportConfig",
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
    viewport_config as "viewportConfig",
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
 * Поля выборки шаблона (bricks_templates) с camelCase-алиасами.
 */
export const TEMPLATE_SELECT_FIELDS = `
    id,
    name,
    description,
    thumbnail_url as "thumbnailUrl",
    schema,
    page_meta as "pageMeta",
    created_at as "createdAt",
    updated_at as "updatedAt"
`;

/**
 * Поля сводки шаблона (bricks_templates) — список без JSONB `schema` и
 * `pageMeta`, зато с числом блоков: карточка показывает объём шаблона, а тянуть
 * ради одного числа всю схему значило бы отдавать список весом в мегабайты.
 *
 * `jsonb_typeof` перед `jsonb_array_length` — не перестраховка: на не-массиве
 * второе падает ошибкой, а `schema` в базе лежит с записей произвольной
 * давности (валидатор ручки гарантирует форму только для новых строк).
 */
export const TEMPLATE_SUMMARY_FIELDS = `
    id,
    name,
    description,
    thumbnail_url as "thumbnailUrl",
    CASE WHEN jsonb_typeof(schema -> 'components') = 'array'
        THEN jsonb_array_length(schema -> 'components')
        ELSE 0
    END as "blocksCount",
    created_at as "createdAt",
    updated_at as "updatedAt"
`;

/**
 * Разрешённые к обновлению поля bricks_templates: только подпись шаблона.
 * Содержимое отпечатка не обновляется — см. IUpdateTemplatePayload.
 */
export const TEMPLATE_UPDATE_FIELDS: ReadonlySet<string> = new Set(['name', 'description']);

/**
 * Поля страницы, которые уезжают в JSONB-колонки: значение сериализуется в
 * текст перед подстановкой в запрос.
 */
const JSONB_PAGE_FIELDS: ReadonlySet<string> = new Set(['schema', 'viewportConfig']);

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
    'viewportConfig',
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

        if (JSONB_PAGE_FIELDS.has(key)) {
            // JSONB-колонке нужен текст: массив набора устройств драйвер иначе
            // передал бы как postgres-массив, и колонка его не примет
            values.push(rawValue === null ? null : JSON.stringify(rawValue));
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
function readSqlStateCode(error: unknown): string | null {
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
 * Классы SQLSTATE, при которых сервер РАЗОБРАЛ statement и отверг его целиком:
 * `22` — данные не лезут в тип или длину, `23` — нарушено ограничение,
 * `42` — не та схема или нет прав. Во всех трёх вставка гарантированно не
 * применилась.
 *
 * Список положительный и по классам, а не по отдельным кодам: перечисление кодов
 * уже дважды оказывалось неполным (`22001` от переросшего колонку MIME, `23505`
 * от отставшей sequence), а каждая дыра в нём — файл-сирота в хранилище.
 * Обратное правило «любой SQLSTATE = откат» при этом неверно: в классах `08`,
 * `40`, `57` есть состояния, прямо означающие неизвестный исход
 * (`08007 transaction_resolution_unknown`, `40003 statement_completion_unknown`),
 * и они остаются неопределёнными вместе со всеми прочими классами.
 */
const REJECTED_WRITE_SQLSTATE_CLASSES: ReadonlySet<string> = new Set(['22', '23', '42']);

/**
 * Отвергнута ли вставка ГАРАНТИРОВАННО — по доказанным признакам: запрос не
 * отправлялся; сервер отменил сам statement своим лимитом времени; схема не
 * соответствует коду либо данные нарушили ограничение.
 *
 * Общая на медиа и шаблоны: у обеих записей есть внешний побочный эффект (файл в
 * хранилище), удалять его можно только под эту гарантию, и вторая копия правила
 * разошлась бы с первой при следующей находке — цена расхождения — файл-сирота
 * либо, наоборот, удалённый файл под живой строкой.
 *
 * @param error - Ошибка вставки.
 * @returns true, если строки в базе точно не появилось.
 */
export function isRejectedPostgresWrite(error: unknown): boolean {
    return (
        error instanceof BricksPostgresQueryNotStartedError ||
        error instanceof BricksStatementTimeoutError ||
        REJECTED_WRITE_SQLSTATE_CLASSES.has((readSqlStateCode(error) ?? '').slice(0, 2))
    );
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
