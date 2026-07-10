import { createError, defineEventHandler } from 'h3';
import { useBricksStorageAdapter } from '../../../../../../modules/persistence/server/registry';
import {
    requireNumericId,
    toHttpError,
} from '../../../../../../modules/persistence/server/utils/handlerHelpers';

/**
 * POST /api/bricks/:id/versions/:versionId/restore — откат страницы к версии.
 *
 * Применяет только schema + layout + backgroundColor: pagename/title/SEO/published
 * не трогаются (нет конфликтов уникальности pagename и неожиданных SEO-откатов).
 * Вызывает updatePage, который сам снапшотит текущее состояние перед откатом —
 * «откат отката» работает без дополнительного кода.
 */
export default defineEventHandler(async (event) => {
    const id = requireNumericId(event);
    const versionId = requireNumericId(event, 'versionId');

    try {
        const storage = useBricksStorageAdapter();
        const version = await storage.getPageVersion(id, versionId);

        if (!version) {
            throw createError({
                statusCode: 404,
                statusMessage: 'Page version not found',
            });
        }

        const result = await storage.updatePage(id, {
            schema: version.schema,
            layout: version.layout,
            backgroundColor: version.backgroundColor,
        });

        if (!result) {
            throw createError({
                statusCode: 404,
                statusMessage: 'Page not found',
            });
        }

        return result;
    } catch (error: unknown) {
        toHttpError(error, 'Failed to restore page version');
    }
});
