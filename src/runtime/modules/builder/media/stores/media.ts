// #region Imports
import { defineStore } from 'pinia';
import type { Composer } from 'vue-i18n';
import { useNuxtApp } from '#imports';
import type {
    IMediaItem,
    IMediaUpdateCategoryRequest,
    IMediaUpdateMetaRequest,
} from '../../../common/types/media';
import { useApiClient } from '../../../common/composables/useApiClient';
import { toCamelCase } from '../../../common/utils/case-transform';
import { isRequestTimeoutError } from '../../../common/utils/apiRequestPolicy';
import { isMediaListResponse, toMediaRequestError } from '../utils/requestErrors';
import { BRICKS_MEDIA_UPLOAD_TIMEOUT_MS } from '../../../common/constants/apiTimeouts';
// #endregion

// #region Data
const DEFAULT_MEDIA_CATEGORY = 'other';
const DEFAULT_MEDIA_MIME_TYPE = 'image/png';
// #endregion

// #region Helpers
/**
 * Переводит ключ через глобальный i18n (стор не имеет setup-контекста).
 * `$i18n` резолвится лениво на каждый вызов — безопасно при любом порядке плагинов.
 */
function t(key: string): string {
    const i18n = useNuxtApp().$i18n as Composer | undefined;
    return i18n ? i18n.t(key) : key;
}

/**
 * Нормализует медиа-элемент из ответа API.
 * Конвертирует snake_case ключи из Django backend в camelCase.
 *
 * @param rawItem - Данные медиа из API (может быть в snake_case).
 * @returns Нормализованный медиа-элемент в camelCase.
 */
function normalizeMediaItem(rawItem: IMediaItem): IMediaItem {
    // Конвертируем snake_case → camelCase
    const item = toCamelCase<IMediaItem>(rawItem);

    return {
        ...item,
        alt: item.alt ?? '',
        category: item.category || DEFAULT_MEDIA_CATEGORY,
        mimeType: item.mimeType || DEFAULT_MEDIA_MIME_TYPE,
    };
}
// #endregion

export const useMediaStore = defineStore('bricksMedia', {
    state: () => ({
        items: [] as IMediaItem[],
        // Счётчик, а не флаг: у двух параллельных загрузок `finally` первой снимал
        // бы индикатор, пока вторая ещё идёт
        uploadingCount: 0,
        // Номер последнего стартовавшего запроса списка — им отсекаются и ответы,
        // пришедшие не в том порядке, в каком уходили, и ответ, который обогнала
        // локальная запись (см. loadItems)
        itemsRequestId: 0,
        // Виден ли весь состав медиатеки. `items.length > 0` этого не означает:
        // загруженный файл кладётся в список локально, до всякого GET'а, — и
        // тогда список содержит одно знакомое имя вместо всей библиотеки. Знать
        // разницу нужно там, где отсутствие URL в списке трактуется как «такого
        // изображения в медиатеке нет» (сравнение при импорте схемы).
        //
        // Отказом не сбрасывается: последний удачный ответ остаётся достоверным
        // снимком, даже если следующий запрос не дошёл.
        hasLoadedItemsSnapshot: false,
    }),

    getters: {
        /**
         * Идёт ли хотя бы одна загрузка файла.
         */
        isUploading: (state): boolean => state.uploadingCount > 0,
    },

    actions: {
        /**
         * Обесценивает уже летящий запрос списка: его ответ ничего не знает о
         * локальной записи, поэтому вернул бы удалённый файл в галерею, потерял
         * только что загруженный и откатил бы правку метаданных.
         */
        invalidatePendingItemsLoad(): void {
            this.itemsRequestId += 1;
        },

        /**
         * Загружает список медиа из бэкенда (S3 + БД).
         *
         * Отказ не опустошает список: уже показанная галерея переживает
         * transient-отказ повторного открытия, а сообщение об отказе получает
         * вызывающий. Нераспознанная форма ответа — тоже отказ, а не пустая
         * галерея: молчаливое опустошение выглядело бы как «файлов нет».
         */
        async loadItems(): Promise<void> {
            const { apiFetcher } = useApiClient();
            const requestId = ++this.itemsRequestId;

            try {
                const response = await apiFetcher<unknown>('/api/bricks/media/');

                if (!isMediaListResponse(response)) {
                    throw new Error(t('bricks.media.listResponseInvalid'));
                }

                if (requestId !== this.itemsRequestId) {
                    return;
                }

                this.items = response.items.map(normalizeMediaItem);
                // Только здесь: ответ принят, значит список равен составу
                // медиатеки на момент ответа. У вытесненного запроса выход выше —
                // его список неактуален, и объявлять по нему снимок нельзя
                this.hasLoadedItemsSnapshot = true;
            } catch (error: unknown) {
                // Отказ вытесненного запроса вызывающему не докладывается: тост
                // об устаревшей попытке накрыл бы результат более свежей, которая
                // уже успела показать список
                if (requestId !== this.itemsRequestId) {
                    return;
                }

                console.error('[Media Store] Failed to load items from backend:', error);

                throw toMediaRequestError(error, 'GET', t, t('bricks.media.loadFailed'));
            }
        },

        /**
         * Отпускает перечитывание списка: вызывающему нужен сам факт запуска, а
         * результат тут ничего не гарантирует — запрос способен обогнать
         * незавершённую серверную запись. Отказ гасится здесь же, иначе реджект
         * ушёл бы в необслуженный промис.
         */
        reloadItemsDetached(): void {
            // `void` не пишем — правило `no-void` в oxlint
            this.loadItems().catch((error: unknown) => {
                console.warn('[Media Store] Items reload after write timeout failed:', error);
            });
        },

        /**
         * Приводит отказ записи к пользовательскому виду; при обрыве по потолку
         * ожидания дополнительно отпускает перечитывание списка — исход записи
         * неизвестен, и это единственная возможность его увидеть.
         *
         * @param error - Исходная ошибка запроса.
         * @param method - HTTP-метод запроса.
         * @param fallbackMessage - Локализованное сообщение на случай молчащей ошибки.
         * @returns Ошибка для показа пользователю.
         */
        toWriteError(error: unknown, method: string, fallbackMessage: string): Error {
            if (isRequestTimeoutError(error)) {
                this.reloadItemsDetached();
            }

            return toMediaRequestError(error, method, t, fallbackMessage);
        },

        /**
         * Применяет к элементу списка поля, которыми владеет завершившаяся
         * операция. Элемент ищется заново по `id`: индекс, снятый до запроса,
         * мог сдвинуться (удаление соседа, перезагрузка списка), и splice по нему
         * заменил бы чужой элемент. Полная замена ответом тоже не годится —
         * ответы двух параллельных PATCH'ей несут по одному свежему полю, и
         * поздний откатывал бы правку раннего.
         *
         * @param id - Идентификатор медиа.
         * @param patch - Поля операции из ответа сервера.
         */
        applyItemPatch(id: number, patch: Partial<IMediaItem>): void {
            this.invalidatePendingItemsLoad();

            const targetIndex = this.items.findIndex((item) => item.id === id);

            if (targetIndex === -1) {
                return;
            }

            this.items.splice(targetIndex, 1, { ...this.items[targetIndex], ...patch });
        },

        /**
         * Загружает файл в медиа-библиотеку одним запросом: сервер атомарно
         * кладёт файл в хранилище публикации и регистрирует метаданные в БД
         * (POST /api/bricks/media/upload, компенсация файла при ошибке БД —
         * на сервере). Ошибка пробрасывается вызывающему.
         *
         * @param file - Файл, который нужно загрузить.
         * @param category - Категория, которая будет назначена (если задана).
         * @returns Промис с сохранённым медиа-элементом.
         */
        async uploadFile(file: File, category?: string): Promise<IMediaItem> {
            const { apiFetcher } = useApiClient();
            this.uploadingCount += 1;

            try {
                const resolvedCategory =
                    category && category !== 'all' ? category : DEFAULT_MEDIA_CATEGORY;

                const formData = new FormData();
                formData.append('file', file);
                formData.append('category', resolvedCategory);

                const response = await apiFetcher<IMediaItem>('/api/bricks/media/upload', {
                    method: 'POST',
                    body: formData,
                    // Отдача файла: сервер принимает видео до 100 МБ, общий потолок
                    // записи оборвал бы медленный канал на исправной загрузке
                    timeout: BRICKS_MEDIA_UPLOAD_TIMEOUT_MS,
                });

                const mediaItem = normalizeMediaItem(response);

                this.invalidatePendingItemsLoad();
                this.items.unshift(mediaItem);

                return mediaItem;
            } catch (error: unknown) {
                console.error('[Media Store] Upload failed:', error);

                throw this.toWriteError(error, 'POST', t('bricks.media.uploadFailed'));
            } finally {
                this.uploadingCount -= 1;
            }
        },

        /**
         * Удаляет медиафайл одним запросом: сервер удаляет файл хранилища и
         * метаданные БД (DELETE /api/bricks/media/:id, file-first). Ошибка
         * пробрасывается вызывающему — элемент остаётся в списке, операция
         * безопасно повторяется.
         *
         * @param id - Идентификатор удаляемого медиафайла.
         */
        async removeItem(id: number): Promise<void> {
            const { apiFetcher } = useApiClient();

            try {
                await apiFetcher(`/api/bricks/media/${encodeURIComponent(id)}/`, {
                    method: 'DELETE',
                });
            } catch (error: unknown) {
                console.error('[Media Store] Failed to delete item:', error);

                throw this.toWriteError(error, 'DELETE', t('bricks.media.deleteFailed'));
            }

            this.invalidatePendingItemsLoad();
            this.items = this.items.filter((item) => item.id !== id);
        },

        /**
         * Обновляет категорию конкретного медиафайла. Ошибка пробрасывается
         * вызывающему: без этого смена категории выглядела бы применённой, хотя
         * сервер её отклонил.
         *
         * @param id - Идентификатор медиа.
         * @param category - Новая категория.
         */
        async updateItemCategory(id: number, category: string): Promise<void> {
            const { apiFetcher } = useApiClient();

            if (!this.items.some((item) => item.id === id)) {
                return;
            }

            let response: IMediaItem;

            try {
                response = await apiFetcher<IMediaItem>(
                    `/api/bricks/media/${encodeURIComponent(id)}/`,
                    {
                        method: 'PATCH',
                        body: {
                            category,
                        } satisfies IMediaUpdateCategoryRequest,
                    }
                );
            } catch (error: unknown) {
                console.error('[Media Store] Failed to update category:', error);

                throw this.toWriteError(error, 'PATCH', t('bricks.media.updateCategoryFailed'));
            }

            this.applyItemPatch(id, { category: normalizeMediaItem(response).category });
        },

        /**
         * Обновляет filename и/или alt конкретного медиафайла. Ошибка
         * пробрасывается вызывающему: без этого переименование выглядело бы
         * применённым, хотя сервер его отклонил.
         *
         * @param id - Идентификатор медиа.
         * @param meta - Обновляемые поля (filename, alt).
         */
        async updateItemMeta(id: number, meta: IMediaUpdateMetaRequest): Promise<void> {
            const { apiFetcher } = useApiClient();

            if (!this.items.some((item) => item.id === id)) {
                return;
            }

            let response: IMediaItem;

            try {
                response = await apiFetcher<IMediaItem>(
                    `/api/bricks/media/${encodeURIComponent(id)}/`,
                    {
                        method: 'PATCH',
                        body: meta,
                    }
                );
            } catch (error: unknown) {
                console.error('[Media Store] Failed to update meta:', error);

                throw this.toWriteError(error, 'PATCH', t('bricks.media.updateMetaFailed'));
            }

            const updatedItem = normalizeMediaItem(response);
            const patch: Partial<IMediaItem> = {};

            if (meta.filename !== undefined) {
                patch.filename = updatedItem.filename;
            }

            if (meta.alt !== undefined) {
                patch.alt = updatedItem.alt;
            }

            this.applyItemPatch(id, patch);
        },
    },
});
