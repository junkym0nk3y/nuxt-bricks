import { createError, defineEventHandler, getRouterParam } from 'h3';
import type { IBricksPageAddress } from '../../../../../modules/common/types/pageAddress';
import { isValidPageAddress } from '../../../../../modules/common/utils/bricks/pageAddress';
import { useBricksStorageAdapter } from '../../../../../modules/persistence/server/registry';
import { toHttpError } from '../../../../../modules/persistence/server/utils/handlerHelpers';
import { toPublicPageProjection } from '../../../../../modules/persistence/server/utils/publicProjection';

/**
 * GET /api/bricks/public/pages/<urlPrefix>/<pagename> — публичная проекция
 * опубликованной страницы (прямой lookup по адресу, без list+find).
 * Draft-страницы и editor-only поля (thumbnailUrl) наружу не отдаются:
 * не-published === 404.
 *
 * Адрес приходит остатком пути, а не парой параметров: страницу опознаёт полный
 * адрес, а его последний сегмент — `pagename`, всё до него — `urlPrefix`.
 * Одно имя страницу больше не определяет: `/blog/post` и `/news/post` — разные
 * страницы, и lookup по имени вернул бы произвольную из них.
 */

/**
 * Разбирает остаток пути в адрес страницы: последний сегмент — `pagename`,
 * предшествующие — `urlPrefix`. Пустые сегменты (двойной слэш, trailing slash)
 * отбрасываются, поэтому и `blog/post`, и `blog/post/` дают один адрес.
 *
 * @param rawAddress - Остаток пути после `public/pages/`.
 * @returns Адрес либо null, если сегментов нет вовсе.
 */
function parseAddressPath(rawAddress: string): IBricksPageAddress | null {
    const segments = rawAddress.split('/').filter(Boolean);
    const pagename = segments.pop();

    if (pagename === undefined) {
        return null;
    }

    return {
        pagename,
        urlPrefix: segments.length > 0 ? segments.join('/') : null,
    };
}

export default defineEventHandler(async (event) => {
    const address = parseAddressPath(getRouterParam(event, 'address', { decode: true }) ?? '');

    // Невалидный формат неотличим от несуществующей страницы — 404 без деталей.
    // Проверка — общая с формой и DTO (`isValidPageAddress`): своя копия правил
    // здесь принимала бы адреса, которых запись не создаёт
    if (!address || !isValidPageAddress(address)) {
        throw createError({ statusCode: 404, statusMessage: 'Page not found' });
    }

    try {
        const page = await useBricksStorageAdapter().getPageByAddress(address);

        if (!page || page.published !== true) {
            throw createError({ statusCode: 404, statusMessage: 'Page not found' });
        }

        return toPublicPageProjection(page);
    } catch (error: unknown) {
        toHttpError(error, 'Failed to fetch page');
    }
});
