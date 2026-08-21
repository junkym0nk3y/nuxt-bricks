/**
 * Page templates: the storage row, the list summary and the write payloads.
 *
 * They live next to the page types (`bricks-api.d.ts`) rather than in a builder
 * domain: the contract is one for three sides — the Postgres adapter, the Nitro
 * endpoints of `/api/bricks/templates/**` and the "Templates" section of the
 * dashboard.
 */
import type { IBricksSchema } from './brick';
import type { TBricksPageDeviceSet } from './devices';

/**
 * The styling of a page that travels into a template along with the schema.
 *
 * Exactly three fields: the layout, the background and the device set. The address,
 * the SEO fields and the publication status do not reach a template — otherwise two
 * pages made from one template would be born with the same address, that is, with a
 * rejection by the unique index.
 *
 * `viewportConfig: null` — the source page inherited the project set, and a page
 * created from the template will inherit it too (that is, the CURRENT project set
 * rather than the one in effect when the template was saved).
 */
export interface IBricksTemplatePageMeta {
    layout: string | null;
    backgroundColor: string | null;
    viewportConfig: TBricksPageDeviceSet | null;
}

/**
 * The full template row (`bricks_templates`) — with the schema and the styling.
 * Returned by the point lookup `GET /api/bricks/templates/:id` only.
 */
export interface IBricksTemplateRow {
    id: number;
    name: string;
    description: string | null;
    /** The template's own preview file; `null` — there is no snapshot, the UI draws a placeholder */
    thumbnailUrl: string | null;
    schema: IBricksSchema;
    pageMeta: IBricksTemplatePageMeta;
    createdAt: string;
    updatedAt: string;
}

/**
 * Summary of a template for the grid of the section and for picking the source of a
 * new page: without `schema` and `pageMeta`, but with the number of blocks.
 *
 * The number of blocks is counted by the storage (`jsonb_array_length`) rather than
 * by the client: the schema is not part of the summary, while the card has to show
 * how much a template holds — otherwise one would have to choose by the name alone.
 */
export type TBricksTemplateSummary = Omit<IBricksTemplateRow, 'schema' | 'pageMeta'> & {
    blocksCount: number;
};

/**
 * Data for creating a template at the storage level.
 *
 * `thumbnailUrl` here is ALREADY the template's own file: the copy of the page frame
 * is made by the endpoint before the adapter is called
 * (`copyThumbnailForTemplate`), because a link to the page frame does not survive
 * the next save of that page.
 */
export interface ICreateTemplatePayload {
    name: string;
    description: string | null;
    schema: IBricksSchema;
    pageMeta: IBricksTemplatePageMeta;
    thumbnailUrl?: string | null;
}

/**
 * Partial update of a template: only the caption (the name and the description) is
 * editable.
 *
 * The content of a template is deliberately not updated: a template is an imprint
 * of a moment, and "update it from the current page" would mean a second entity (an
 * inheritance source) with versions and conflict resolution.
 */
export interface IUpdateTemplatePayload {
    name?: string;
    description?: string | null;
}
