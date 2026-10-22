import type { IBricksSchema } from '../../types/brick';
import type {
    IBricksPageCode,
    IPublishedPage,
    TPublishedPageSummary,
} from '../../types/bricks-api';
import { toCamelCase } from '../case-transform';

export const DEFAULT_BACKGROUND_COLOR = '#FFFFFF';
export const DEFAULT_LAYOUT = 'default';

/**
 * Checks that the value looks like an IBricksSchema.
 *
 * @param value - Value being checked.
 */
function isBricksSchema(value: unknown): value is IBricksSchema {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        return false;
    }

    const record = value as Record<string, unknown>;
    return Array.isArray(record.components);
}

/**
 * Normalizes a schema: guarantees that components is present, keeps meta when it
 * is not empty.
 *
 * @param schema - Landing schema.
 * @returns Normalized schema.
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
 * Checks the subdomain of a page against the actual host of the request (the
 * former `includes` matched notpromo.example under "promo").
 * The host is normalized by the URL parser (port, case, trailing dot); a value
 * without dots is compared with the first label of the hostname, one with dots
 * with the full hostname (an explicit mapping). ASCII slug values are expected —
 * punycode hosts with a non-ASCII config deliberately do not match.
 *
 * @param hostHeader - The SSR Host header (may carry a port) or the browser hostname.
 * @param subdomain - The subdomain field of the page.
 * @returns true — the page is shown on this host.
 */
export function matchesPageSubdomain(
    hostHeader: string | undefined,
    subdomain: string | null | undefined
): boolean {
    const requested = (subdomain ?? '').trim().toLowerCase();

    if (!requested) {
        return true;
    }

    if (!hostHeader) {
        return false;
    }

    let hostname: string;

    try {
        hostname = new URL(`http://${hostHeader}`).hostname.toLowerCase();
    } catch {
        return false;
    }

    hostname = hostname.replace(/\.$/, '');

    if (requested.includes('.')) {
        return hostname === requested;
    }

    const [firstLabel] = hostname.split('.');
    return firstLabel === requested;
}

/**
 * Picks the third-party code of a page and its `noindex` flag. Absent from an
 * external backend that predates the fields and from old snapshots: the page then
 * has no code and stays indexable.
 *
 * @param page - Page data already in camelCase.
 * @returns The page code fields.
 */
function pickPageCode(page: Partial<IPublishedPage>): IBricksPageCode {
    return {
        headCode: page.headCode ?? null,
        bodyEndCode: page.bodyEndCode ?? null,
        noindex: page.noindex === true,
    };
}

/**
 * Normalizes an API response into the IPublishedPage shape.
 * Converts the snake_case keys (database rows, an external backend) into
 * camelCase, but leaves `schema` alone (that is user JSON).
 *
 * @param rawPage - Page data from the API (may be in snake_case).
 * @param defaultBackgroundColor - Background color when the page stores none.
 * @returns The normalized published page in camelCase.
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
        viewportConfig: page.viewportConfig ?? null,
        schema: preserveSchema(schema),
        published: Boolean(page.published),
        ...pickPageCode(page),
        // Absent from the public projection and from old snapshots — a write with
        // no precondition then
        revision: typeof page.revision === 'number' ? page.revision : undefined,
        createdAt,
        updatedAt,
        isPreview: page.isPreview,
    };
}

/**
 * Assembles a preview page out of the snapshot of a saved version: the content and
 * the meta come from the version, the identity of the page from the current row.
 *
 * The `id` of a snapshot identifies a history record rather than a page; the
 * address (`pagename` + `urlPrefix`) in it may have stayed the old one if the page
 * was moved — while the preview is opened at the present address. That is why both
 * the id and both halves of the address are taken from the page: with an old prefix
 * in the snapshot the address check in the preview and in the renderer would reject
 * the page as a foreign one.
 *
 * `updatedAt` is the `pageUpdatedAt` of the snapshot, that is, the moment the
 * captured state was saved: the version card in the gallery is labeled with that
 * very date. `revision` is not carried over — there is nothing to write from a
 * preview, so a precondition is of no use.
 *
 * The page code and `noindex` come from the page as well: a version does not carry
 * them, and a restored version runs with the code the page has now.
 *
 * @param rawVersion - Response of `GET /api/bricks/:id/versions/:versionId` (snake_case possible).
 * @param page - Summary of the current page.
 * @returns The page to render the version preview from.
 */
export function normalizePageVersionPreview(
    rawVersion: unknown,
    page: TPublishedPageSummary
): IPublishedPage {
    const rawRecord: Record<string, unknown> =
        typeof rawVersion === 'object' && rawVersion !== null && !Array.isArray(rawVersion)
            ? (rawVersion as Record<string, unknown>)
            : {};

    const rawPageUpdatedAt = rawRecord.pageUpdatedAt ?? rawRecord.page_updated_at;
    const pageUpdatedAt = typeof rawPageUpdatedAt === 'string' ? rawPageUpdatedAt : '';

    return {
        ...normalizePublishedPage(rawVersion),
        id: page.id,
        pagename: page.pagename,
        urlPrefix: page.urlPrefix,
        headCode: page.headCode,
        bodyEndCode: page.bodyEndCode,
        noindex: page.noindex,
        createdAt: page.createdAt,
        updatedAt: pageUpdatedAt || page.updatedAt,
        revision: undefined,
        isPreview: true,
    };
}

/**
 * Normalizes the page summary of the editorial list (without `schema`): the same
 * rules as normalizePublishedPage, but without fabricating an empty schema — a
 * summary carries no schema, and none must reach the store of the list.
 *
 * @param rawPage - Summary data from the API (may be in snake_case).
 * @param defaultBackgroundColor - Background color when the page stores none.
 * @returns The normalized page summary.
 */
export function normalizePublishedPageSummary(
    rawPage: unknown,
    defaultBackgroundColor: string = DEFAULT_BACKGROUND_COLOR
): TPublishedPageSummary {
    const {
        schema: _schema,
        isPreview: _isPreview,
        ...summary
    } = normalizePublishedPage(rawPage, defaultBackgroundColor);

    return summary;
}
