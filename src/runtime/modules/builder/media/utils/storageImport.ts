// #region Imports
// Types
import type { IApiFetcher } from '../../../common/types/composables';
import type { TRequestErrorLike } from '../../../common/types/bricks-api';
import type { IMediaStorageImportResult } from '../types/storageImport';

// Utils
import { isMediaListResponse } from './requestErrors';
// #endregion

// #region Data
/** Отказ по правам: у роли ниже администраторской импорта нет и не будет. */
const FORBIDDEN_STATUS = 403;
// #endregion

/**
 * Просит сервер зарегистрировать в медиатеке файлы, уже лежащие в хранилище
 * публикации.
 *
 * Прежде это делала сама ручка списка при пустой таблице — то есть GET писал в
 * БД: безопасные методы проходят мимо CSRF-гейта, и запись досталась бы роли,
 * которой разрешено только чтение.
 *
 * Отказ не показывается пользователю — импорт не то, ради чего открывали
 * галерею, — но исходы различаются. 403 окончателен: у наблюдателя и редактора
 * прав нет, и повторять запрещённый POST на каждое открытие пустой галереи
 * незачем. Прочие отказы (обрыв сети, 5xx, нераспознанный ответ) считаются
 * временными: свести их к тому же «не пробовать больше» значило бы, что один
 * сетевой сбой оставляет администратора с пустой галереей до перезагрузки
 * страницы.
 *
 * @param apiFetcher - Клиент bricks-API.
 * @returns Состав медиатеки и признак того, имеет ли смысл повторить попытку.
 */
export async function requestMediaStorageImport(
    apiFetcher: IApiFetcher
): Promise<IMediaStorageImportResult> {
    try {
        const response = await apiFetcher<unknown>('/api/bricks/media/import', {
            method: 'POST',
        });

        if (isMediaListResponse(response)) {
            return { items: response.items, isRetryable: false };
        }

        // Нераспознанная форма ответа — не доказательство отказа сервера:
        // импорт мог пройти, поэтому попытку не хороним
        console.warn('[Media Store] Unexpected storage import response shape');

        return { items: [], isRetryable: true };
    } catch (error: unknown) {
        console.warn('[Media Store] Storage import skipped:', error);

        return {
            items: [],
            isRetryable: (error as TRequestErrorLike).statusCode !== FORBIDDEN_STATUS,
        };
    }
}
