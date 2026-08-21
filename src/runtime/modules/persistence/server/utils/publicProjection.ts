/**
 * The page's public projection for the `/api/bricks/public/**` read model.
 *
 * The editorial database row carries editor-only fields (thumbnailUrl — the canvas
 * preview for the dashboard) — only a safe subset is exposed. New editor fields do
 * NOT make it into the public response by default: the projection is assembled by an
 * explicit enumeration rather than by deleting the extras.
 */
import type { IBricksPageRow } from '../../../common/types/bricks-api';

/** The public subset of a page's fields (with no editor-only data). */
export type TPublicPageProjection = Omit<IBricksPageRow, 'thumbnailUrl' | 'revision'>;

/**
 * Assembles the page's public projection.
 *
 * @param page - The page's full row from the adapter.
 * @returns The public subset of the fields.
 */
export function toPublicPageProjection(page: IBricksPageRow): TPublicPageProjection {
    return {
        id: page.id,
        pagename: page.pagename,
        title: page.title,
        description: page.description,
        keywords: page.keywords,
        backgroundColor: page.backgroundColor,
        layout: page.layout,
        socialImage: page.socialImage,
        urlPrefix: page.urlPrefix,
        subdomain: page.subdomain,
        // The device set is part of a published page's layout rather than editor-only
        // data: without it a published page would compute its thresholds by the
        // project's set while the builder shows the page's own set
        viewportConfig: page.viewportConfig,
        schema: page.schema,
        published: page.published,
        createdAt: page.createdAt,
        updatedAt: page.updatedAt,
    };
}
