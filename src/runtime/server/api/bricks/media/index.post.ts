import { createError, defineEventHandler } from 'h3';
import {
    useBricksPublishAdapter,
    useBricksStorageAdapter,
} from '../../../../modules/persistence/server/registry';
import {
    readNormalizedBody,
    toHttpError,
} from '../../../../modules/persistence/server/utils/handlerHelpers';
import { validateCreateMediaPayload } from '../../../../modules/persistence/server/utils/mediaPayloadValidation';
import { sanitizeSvgMarkup } from '../../../../modules/common/utils/sanitize/sanitizeSvg';

/**
 * POST /api/bricks/media — сохраняет метаданные загруженного файла
 * (сам файл уже загружен через /mock-api/s3-image).
 *
 * Регистрируются только URL собственного хранилища (isOwnedUrl):
 * зарегистрированная запись становится «доверенной» для media-proxy,
 * поэтому произвольный URL здесь — это отложенный SSRF.
 */
export default defineEventHandler(async (event) => {
    try {
        const body = validateCreateMediaPayload(
            await readNormalizedBody<Record<string, unknown>>(event)
        );

        if (!useBricksPublishAdapter().isOwnedUrl(body.url)) {
            throw createError({
                statusCode: 400,
                statusMessage: 'Url does not belong to the configured media storage',
            });
        }

        // Inline SVG — недоверенный ввод: в БД сохраняется санитизированная разметка
        if (body.svgContent) {
            body.svgContent = sanitizeSvgMarkup(body.svgContent);
        }

        return await useBricksStorageAdapter().createMedia(body);
    } catch (error: unknown) {
        toHttpError(error, 'Failed to save media item');
    }
});
