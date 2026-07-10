import { createError, defineEventHandler, getRouterParam } from 'h3';
import {
    PAGENAME_MAX_LENGTH,
    PAGENAME_PATTERN,
} from '../../../../../modules/common/constants/publish';
import { useBricksStorageAdapter } from '../../../../../modules/persistence/server/registry';
import { toHttpError } from '../../../../../modules/persistence/server/utils/handlerHelpers';
import { toPublicPageProjection } from '../../../../../modules/persistence/server/utils/publicProjection';

/**
 * GET /api/bricks/public/pages/:pagename — публичная проекция опубликованной
 * страницы (прямой lookup по pagename, без list+find). Draft-страницы и
 * editor-only поля (thumbnailUrl) наружу не отдаются: не-published === 404.
 */
export default defineEventHandler(async (event) => {
    const pagename = getRouterParam(event, 'pagename') ?? '';

    // Невалидный формат неотличим от несуществующей страницы — 404 без деталей
    if (pagename.length > PAGENAME_MAX_LENGTH || !PAGENAME_PATTERN.test(pagename)) {
        throw createError({ statusCode: 404, statusMessage: 'Page not found' });
    }

    try {
        const page = await useBricksStorageAdapter().getPageByPagename(pagename);

        if (!page || page.published !== true) {
            throw createError({ statusCode: 404, statusMessage: 'Page not found' });
        }

        return toPublicPageProjection(page);
    } catch (error: unknown) {
        toHttpError(error, 'Failed to fetch page');
    }
});
