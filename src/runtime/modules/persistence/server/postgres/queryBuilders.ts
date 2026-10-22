/**
 * SQL fragments and query builders for the bricks_pages / bricks_media /
 * bricks_templates tables.
 * The SELECT fields set camelCase aliases — the handlers' responses come out in
 * the frontend's format right away.
 */
import type { IPostgresErrorLike } from '../../types/postgres';
import { toSnakeCaseString } from '../../../common/utils/case-transform';
import {
    BricksPostgresQueryNotStartedError,
    BricksStatementTimeoutError,
} from '../utils/storageErrors';

/**
 * The page selection fields (bricks_pages) with camelCase aliases.
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
    head_code as "headCode",
    body_end_code as "bodyEndCode",
    noindex,
    revision,
    created_at as "createdAt",
    updated_at as "updatedAt"
`;

/**
 * The page summary fields (bricks_pages) — the editorial list without the JSONB
 * schema (the same pattern as VERSION_SUMMARY_FIELDS: the list is light, the full
 * row comes from a point lookup by id).
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
    head_code as "headCode",
    body_end_code as "bodyEndCode",
    noindex,
    revision,
    created_at as "createdAt",
    updated_at as "updatedAt"
`;

/**
 * The page version summary fields (bricks_page_versions) — a light list without
 * the schema. `thumbnailUrl` and `pageUpdatedAt` are part of the summary: the
 * version gallery draws both the preview and the save date of the captured state
 * from the list, and without them every card would have to pull the full snapshot
 * with its schema.
 */
export const VERSION_SUMMARY_FIELDS = `
    id,
    page_id as "pageId",
    thumbnail_url as "thumbnailUrl",
    page_updated_at as "pageUpdatedAt",
    created_at as "createdAt"
`;

/**
 * The fields of a page version's full snapshot (bricks_page_versions) with
 * camelCase aliases.
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
 * The media selection fields (bricks_media) with camelCase aliases.
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
 * The media category selection fields (bricks_media_categories) with camelCase
 * aliases.
 */
export const MEDIA_CATEGORY_SELECT_FIELDS = `
    id,
    slug,
    label,
    sort_order as "sortOrder"
`;

/**
 * The template selection fields (bricks_templates) with camelCase aliases.
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
 * The template summary fields (bricks_templates) — a list without the JSONB
 * `schema` and `pageMeta`, but with the block count: the card shows a template's
 * size, and pulling the whole schema for the sake of one number would mean serving
 * a list weighing megabytes.
 *
 * The `jsonb_typeof` ahead of `jsonb_array_length` is not over-caution: over a
 * non-array the latter fails with an error, and `schema` sits in the database from
 * records of arbitrary age (the handler's validator guarantees the shape for new
 * rows only).
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
 * The bricks_templates fields allowed to be updated: the template's label only.
 * The captured content is never updated — see IUpdateTemplatePayload.
 */
export const TEMPLATE_UPDATE_FIELDS: ReadonlySet<string> = new Set(['name', 'description']);

/**
 * The page fields that go into JSONB columns: the value is serialized into text
 * before being substituted into the query.
 */
const JSONB_PAGE_FIELDS: ReadonlySet<string> = new Set(['schema', 'viewportConfig']);

/**
 * The bricks_pages fields allowed to be updated (the request body's camelCase
 * keys). Column names are interpolated into SET — keys outside the whitelist are
 * dropped (protection against SQL injection through column names).
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
    'headCode',
    'bodyEndCode',
    'noindex',
]);

/**
 * The bricks_media fields allowed to be updated (the request body's camelCase
 * keys).
 */
export const MEDIA_UPDATE_FIELDS: ReadonlySet<string> = new Set(['filename', 'alt', 'category']);

/**
 * Assembles a dynamic UPDATE from the passed fields (camelCase → snake_case).
 * The `schema` field is serialized into JSON to be written into a JSONB column.
 * Keys outside `allowedFields` are dropped silently — the request body comes from
 * the client, and without the whitelist an arbitrary key would land in SET as a
 * column name.
 *
 * @param body - The object with the changed fields (camelCase, undefined fields
 * are skipped).
 * @param allowedFields - The whitelist of camelCase keys allowed for the table.
 * @returns The array of SET expressions and the array of values for the
 * parameterized query.
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
            // A JSONB column needs text: otherwise the driver would pass the
            // device set's array as a postgres array, and the column will not
            // take it
            values.push(rawValue === null ? null : JSON.stringify(rawValue));
            return;
        }

        values.push(rawValue ?? null);
    });

    return { updates, values };
}

/** The PostgreSQL unique_violation code. */
const UNIQUE_VIOLATION_CODE = '23505';

/** The PostgreSQL foreign_key_violation code. */
const FOREIGN_KEY_VIOLATION_CODE = '23503';

/**
 * Pulls the SQLSTATE code from a driver error.
 *
 * @param error - The caught query error.
 * @returns The code, or null when this is not a pg error with a code.
 */
function readSqlStateCode(error: unknown): string | null {
    if (typeof error !== 'object' || error === null) {
        return null;
    }

    const code = (error as IPostgresErrorLike).code;

    return typeof code === 'string' ? code : null;
}

/**
 * Checks that the error is a PostgreSQL uniqueness violation (SQLSTATE 23505).
 * Used for idempotent inserts: the race of "two inserting one url" is resolved by
 * reading again rather than by a 500.
 *
 * @param error - The caught query error.
 * @returns true for unique_violation.
 */
export function isUniqueViolation(error: unknown): boolean {
    return readSqlStateCode(error) === UNIQUE_VIOLATION_CODE;
}

/**
 * The SQLSTATE classes in which the server PARSED the statement and rejected it
 * outright: `22` — the data does not fit the type or the length, `23` — a
 * constraint was violated, `42` — the wrong schema or no rights. In all three the
 * insert is guaranteed not to have been applied.
 *
 * The list is a positive one and goes by classes rather than by individual codes:
 * an enumeration of codes has already turned out incomplete twice (`22001` from a
 * MIME that outgrew its column, `23505` from a lagging sequence), and every hole
 * in it is an orphaned file in storage. The reverse rule "any SQLSTATE = a
 * rollback" is wrong, though: classes `08`, `40` and `57` hold states that mean an
 * unknown outcome outright (`08007 transaction_resolution_unknown`,
 * `40003 statement_completion_unknown`), and they stay undetermined along with
 * every other class.
 */
const REJECTED_WRITE_SQLSTATE_CLASSES: ReadonlySet<string> = new Set(['22', '23', '42']);

/**
 * Whether the insert was rejected FOR CERTAIN — by proven signs: the request was
 * never sent; the server canceled the statement itself by its own time limit; the
 * schema does not match the code or the data violated a constraint.
 *
 * Shared between media and templates: both writes have an external side effect (a
 * file in storage), it may only be deleted under this guarantee, and a second copy
 * of the rule would drift away from the first at the next finding — the price of
 * the divergence is either an orphaned file or, the other way round, a deleted file
 * under a live row.
 *
 * @param error - The insert's error.
 * @returns true when the row definitely never appeared in the database.
 */
export function isRejectedPostgresWrite(error: unknown): boolean {
    return (
        error instanceof BricksPostgresQueryNotStartedError ||
        error instanceof BricksStatementTimeoutError ||
        REJECTED_WRITE_SQLSTATE_CLASSES.has((readSqlStateCode(error) ?? '').slice(0, 2))
    );
}

/**
 * Pulls the name of the violated constraint from a driver error.
 *
 * @param error - The caught query error.
 * @returns The constraint's name, or null.
 */
export function readViolatedConstraint(error: unknown): string | null {
    if (typeof error !== 'object' || error === null) {
        return null;
    }

    const constraint = (error as IPostgresErrorLike).constraint;

    return typeof constraint === 'string' ? constraint : null;
}

/**
 * Checks that the error is a PostgreSQL foreign key violation (SQLSTATE 23503).
 *
 * Telling the particular constraint apart by name was deliberately left undone:
 * `bricks_media` has exactly one foreign key (`category` →
 * `bricks_media_categories.slug`), and its name is not set in the base migration —
 * PostgreSQL generates it itself, and a typo in the expected name would fail the
 * recognition SILENTLY, returning the very generic 500 this check is introduced
 * for. The caller must apply it to a `bricks_media` write only and only
 * when the payload carries a non-null category; should a second foreign key
 * appear, it will have to be narrowed by `constraint`.
 *
 * @param error - The caught query error.
 * @returns true for foreign_key_violation.
 */
export function isForeignKeyViolation(error: unknown): boolean {
    return readSqlStateCode(error) === FOREIGN_KEY_VIOLATION_CODE;
}
