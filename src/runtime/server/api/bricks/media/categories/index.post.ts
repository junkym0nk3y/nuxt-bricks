import { defineEventHandler } from 'h3';
import { useBricksStorageAdapter } from '../../../../../modules/persistence/server/registry';
import {
    readNormalizedBody,
    toHttpError,
} from '../../../../../modules/persistence/server/utils/handlerHelpers';
import { validateCreateMediaCategoryPayload } from '../../../../../modules/persistence/server/utils/mediaPayloadValidation';

/**
 * POST /api/bricks/media/categories — создаёт пользовательскую категорию.
 *
 * Slug выводится из подписи на сервере (см. validateCreateMediaCategoryPayload).
 * Повтор существующего slug'а возвращает существующую запись, а не 409:
 * состояние UI в обеих ветках одно, и двойной клик по «подтвердить» не должен
 * показывать ошибку на успешно созданной категории. Дубликат UI ловит сам —
 * сверяя введённую подпись с уже показанным рядом чипов.
 */
export default defineEventHandler(async (event) => {
    try {
        const payload = validateCreateMediaCategoryPayload(
            await readNormalizedBody<Record<string, unknown>>(event)
        );

        return await useBricksStorageAdapter().createMediaCategory(payload);
    } catch (error: unknown) {
        toHttpError(error, 'Failed to create media category');
    }
});
