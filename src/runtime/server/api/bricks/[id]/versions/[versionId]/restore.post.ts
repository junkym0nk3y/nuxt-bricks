import { defineEventHandler } from 'h3';
import { useBricksStorageAdapter } from '../../../../../../modules/persistence/server/registry';
import {
    requireNumericId,
    readNormalizedBody,
    toPageHttpError,
} from '../../../../../../modules/persistence/server/utils/handlerHelpers';
import { validateRestoreVersionPayload } from '../../../../../../modules/persistence/server/utils/payloadValidation';
import { restorePageVersion } from '../../../../../../modules/persistence/server/utils/pageVersionRestore';

/**
 * POST /api/bricks/:id/versions/:versionId/restore — откат страницы к версии.
 *
 * Применяет только schema + layout + backgroundColor: pagename/title/SEO/published
 * не трогаются (нет конфликтов уникальности pagename и неожиданных SEO-откатов).
 * Идёт через updatePage, который сам снапшотит текущее состояние перед откатом —
 * «откат отката» работает без дополнительного кода.
 *
 * Optimistic locking: тело запроса обязано содержать `expectedRevision`
 * (precondition, НЕ записываемое поле) — несовпадение с текущей revision
 * страницы → 409 `data.code=REVISION_CONFLICT` через toPageHttpError, ничего
 * не меняется. В отличие от PUT/PATCH `/api/bricks/:id`, здесь precondition
 * обязателен (не опционален) — до этой ручки restore тихо перезаписывал
 * конкурентные правки, отправляя POST без тела вообще.
 *
 * Остальные мутации versioned page state — сознательно last-write-wins, без
 * precondition (см. CLAUDE.md «Гонки записи и optimistic locking страниц»):
 * DELETE `/api/bricks/:id`, thumbnail-only PATCH (fire-and-forget превью после
 * снапшота канваса) и toggle `published` — однополевые операции, которые
 * ничего контентного не перетирают.
 */
export default defineEventHandler(async (event) => {
    const id = requireNumericId(event);
    const versionId = requireNumericId(event, 'versionId');

    try {
        const { expectedRevision } = validateRestoreVersionPayload(
            await readNormalizedBody<Record<string, unknown>>(event)
        );

        return await restorePageVersion(
            { storage: useBricksStorageAdapter() },
            id,
            versionId,
            expectedRevision
        );
    } catch (error: unknown) {
        toPageHttpError(error, 'Failed to restore page version');
    }
});
