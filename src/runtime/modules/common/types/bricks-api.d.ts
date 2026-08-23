import type { IBricksSchema } from './brick';
import type { TBricksPageDeviceSet } from './devices';

/**
 * Common shape of an API/fetch/database error: covers createError (h3), FetchError
 * (ofetch, `data`) and driver errors carrying a `code` (pg). Every field is
 * optional — a real error can be anything.
 */
export interface IApiError {
    statusCode?: number;
    statusMessage?: string;
    message?: string;
    code?: string;
    data?: { message?: string };
}

/**
 * Data shape for the frontend.
 * The database returns snake_case; the keys are camelized on the way out by
 * `toCamelCase` (common/utils/case-transform.ts).
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
    thumbnailUrl: string | null;
    /**
     * The page's own device set; `null` — the page inherits the project set.
     *
     * A device width serves both as the canvas sheet and as the `min-width` of its
     * media-query range, so the set is the single source of the page layout. The
     * `null` semantics matter for the history: a restored version of an inheriting
     * page will show the CURRENT project set rather than the one in effect at the
     * moment of the snapshot.
     */
    viewportConfig: TBricksPageDeviceSet | null;
    schema: IBricksSchema;
    published: boolean;
    /** Monotonic counter of row changes — the precondition of optimistic locking */
    revision: number;
    createdAt: string;
    updatedAt: string;
}

/**
 * Summary of a page row for the editorial list (`GET /api/bricks`) — without the
 * JSONB `schema`. The full row is only returned by the point lookup
 * `GET /api/bricks/:id`.
 */
export type TBricksPageSummaryRow = Omit<IBricksPageRow, 'schema'>;

/**
 * Data shape for the frontend (a flat structure without settings).
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
    thumbnailUrl: string | null;
    /**
     * The page's own device set; `null` — the page inherits the project set.
     *
     * A device width serves both as the canvas sheet and as the `min-width` of its
     * media-query range, so the set is the single source of the page layout. The
     * `null` semantics matter for the history: a restored version of an inheriting
     * page will show the CURRENT project set rather than the one in effect at the
     * moment of the snapshot.
     */
    viewportConfig: TBricksPageDeviceSet | null;
    schema: IBricksSchema;
    published: boolean;
    /**
     * Revision of the editorial row for optimistic locking. Optional only because
     * the public projection (`/api/bricks/public/**`) does not return the field.
     * Which writes carry it as a precondition and which go last-write-wins is
     * decided by `IUpdatePagePayload.expectedRevision`.
     */
    revision?: number;
    createdAt: string;
    updatedAt: string;
    isPreview?: boolean;
}

/**
 * Client-side page summary (the editorial list without `schema`): meta, routing,
 * `thumbnailUrl` and `revision` — everything the dashboard and the preconditions
 * need. The editor and the duplication get the schema with the point lookup
 * `GET /api/bricks/:id`.
 */
export type TPublishedPageSummary = Omit<IPublishedPage, 'schema' | 'isPreview'>;

/**
 * Page snapshot for the preview in localStorage (`bricks-preview-page`).
 * `storedAt` is the moment of the write; the preview compares it with the
 * `updatedAt` from the database so that a stale snapshot does not overwrite fresh
 * saved data.
 *
 * Stores the state of the CANVAS only (the database does not hold it). The preview
 * of a saved version does not use this slot: the version goes into the `?version=`
 * of the preview route and arrives from the server — otherwise a builder open
 * alongside would overwrite the version snapshot with the live schema, and a
 * second preview would overwrite it with a snapshot of another version.
 */
export interface IPreviewStoredPage extends IPublishedPage {
    storedAt?: string;
}

/**
 * Summary of a saved page version (a light list without the schema).
 *
 * `thumbnailUrl` is the canvas snapshot of the state the version carried away;
 * `null` for the versions created before the history got snapshots (and for those
 * whose snapshot never arrived: taking a preview is fire-and-forget).
 *
 * The two dates are not a duplicate: `createdAt` is the moment of the snapshot,
 * that is, the moment the state was **displaced**; `pageUpdatedAt` (the updated_at
 * of the source row at the moment of the snapshot) is the moment it was **saved**.
 * The user is shown the second one: it describes what is on the snapshot.
 */
export interface IPageVersionSummary {
    id: number;
    pageId: number;
    thumbnailUrl: string | null;
    pageUpdatedAt: string | null;
    createdAt: string;
}

/**
 * Full snapshot of a page version: meta + schema as of the moment it was saved.
 */
export interface IPageVersion extends IPageVersionSummary {
    pagename: string;
    title: string | null;
    description: string | null;
    keywords: string | null;
    socialImage: string | null;
    layout: string | null;
    backgroundColor: string | null;
    urlPrefix: string | null;
    subdomain: string | null;
    /**
     * The page's own device set; `null` — the page inherits the project set.
     *
     * A device width serves both as the canvas sheet and as the `min-width` of its
     * media-query range, so the set is the single source of the page layout. The
     * `null` semantics matter for the history: a restored version of an inheriting
     * page will show the CURRENT project set rather than the one in effect at the
     * moment of the snapshot.
     */
    viewportConfig: TBricksPageDeviceSet | null;
    schema: IBricksSchema;
    published: boolean;
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
    viewportConfig?: TBricksPageDeviceSet | null;
    schema: IBricksSchema;
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
    viewportConfig?: TBricksPageDeviceSet | null;
    thumbnailUrl?: string | null;
    schema?: IBricksSchema;
    published?: boolean;
    /**
     * Precondition of optimistic locking (NOT a writable field): the row revision
     * the client expects. On a mismatch with the current one the adapter has to
     * throw BricksRevisionConflictError (409) changing nothing. Without the field
     * — a write with no precondition (last-write-wins).
     */
    expectedRevision?: number;
}

/**
 * Data of the publish form (without the schema).
 * `thumbnailUrl` is excluded: the field is machine-written (only by a PATCH after
 * a canvas snapshot), the form and the duplication never touch it — that way a PUT
 * of the full page does not wipe the preview.
 */
export type TPublishFormState = Omit<
    IPublishedPage,
    'id' | 'schema' | 'isPreview' | 'thumbnailUrl'
>;

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
