import { defineEventHandler } from 'h3';
import { useBricksStorageAdapter } from '../../../../modules/persistence/server/registry';
import { toHttpError } from '../../../../modules/persistence/server/utils/handlerHelpers';
import { importMediaFromStorage } from '../../../../modules/persistence/server/utils/mediaImport';

/**
 * POST /api/bricks/media/import — регистрирует в медиатеке файлы, лежащие в
 * managed-префиксе хранилища, но отсутствующие в БД.
 *
 * Выделена из GET списка: там импорт был записью под безопасным методом (мимо
 * CSRF-гейта и мимо разделения прав). Требует `admin` — операция массовая и
 * заводит записи сразу обо всём префиксе, а не о файле, с которым работает
 * редактор.
 *
 * Идемпотентна: `createMedia` дефолтного адаптера при конфликте по url
 * возвращает существующую запись, поэтому повторный вызов дубликатов не плодит.
 * Пустой список в ответе означает «импортировать было нечего» — в том числе при
 * недоступном хранилище (импорт в этом случае молча пропускается, чтобы отказ
 * бакета не выглядел отказом медиатеки).
 */
export default defineEventHandler(async () => {
    try {
        await importMediaFromStorage();

        return { success: true, items: await useBricksStorageAdapter().listMedia() };
    } catch (error: unknown) {
        toHttpError(error, 'Failed to import media from storage');
    }
});
