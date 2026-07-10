// #region Imports
import { defineStore } from 'pinia';
import type { Composer } from 'vue-i18n';
import { useNuxtApp } from '#imports';
import type {
    IMediaItem,
    IMediaListResponse,
    IMediaUpdateCategoryRequest,
    IMediaUpdateMetaRequest,
} from '../../../common/types/media';
import { useApiClient } from '../../../common/composables/useApiClient';
import { toCamelCase } from '../../../common/utils/case-transform';
import { getBricksErrorMessage } from '../../../common/utils/main';
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
        isUploading: false,
    }),

    actions: {
        /**
         * Загружает список медиа из бэкенда (S3 + БД).
         * Поддерживает два формата ответа:
         * - Django backend: массив напрямую [...]
         * - Локальный API: { success: true, items: [...] }
         */
        async loadItems(): Promise<void> {
            const { apiFetcher } = useApiClient();

            try {
                const response = await apiFetcher<IMediaListResponse | IMediaItem[]>(
                    '/api/bricks/media/'
                );

                // Django возвращает массив напрямую, локальный API - объект с items
                if (Array.isArray(response)) {
                    this.items = response.map(normalizeMediaItem);
                    return;
                }

                if (response.success && Array.isArray(response.items)) {
                    this.items = response.items.map(normalizeMediaItem);
                    return;
                }

                this.items = [];
            } catch (error) {
                const message = getBricksErrorMessage(error, t('bricks.media.loadFailed'));
                const formatted = `GET /api/bricks/media: ${message}`;
                console.error('[Media Store] Failed to load items from backend:', error);
                this.items = [];
                throw new Error(formatted);
            }
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
            this.isUploading = true;

            try {
                const resolvedCategory =
                    category && category !== 'all' ? category : DEFAULT_MEDIA_CATEGORY;

                const formData = new FormData();
                formData.append('file', file);
                formData.append('category', resolvedCategory);

                const response = await apiFetcher<IMediaItem>('/api/bricks/media/upload', {
                    method: 'POST',
                    body: formData,
                });

                const mediaItem = normalizeMediaItem(response);

                this.items.unshift(mediaItem);

                return mediaItem;
            } catch (error) {
                console.error('[Media Store] Upload failed:', error);
                throw error;
            } finally {
                this.isUploading = false;
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

            await apiFetcher(`/api/bricks/media/${encodeURIComponent(id)}/`, {
                method: 'DELETE',
            });

            this.items = this.items.filter((item) => item.id !== id);
        },

        /**
         * Обновляет категорию конкретного медиафайла.
         *
         * @param id - Идентификатор медиа.
         * @param category - Новая категория.
         */
        async updateItemCategory(id: number, category: string): Promise<void> {
            const { apiFetcher } = useApiClient();
            const targetIndex = this.items.findIndex((item) => item.id === id);
            if (targetIndex === -1) {
                return;
            }

            try {
                const response = await apiFetcher<IMediaItem>(
                    `/api/bricks/media/${encodeURIComponent(id)}/`,
                    {
                        method: 'PATCH',
                        body: {
                            category,
                        } satisfies IMediaUpdateCategoryRequest,
                    }
                );

                const updatedItem = normalizeMediaItem(response);

                this.items.splice(targetIndex, 1, updatedItem);
            } catch (error) {
                console.error('[Media Store] Failed to update category:', error);
            }
        },

        /**
         * Обновляет filename и/или alt конкретного медиафайла.
         *
         * @param id - Идентификатор медиа.
         * @param meta - Обновляемые поля (filename, alt).
         */
        async updateItemMeta(id: number, meta: IMediaUpdateMetaRequest): Promise<void> {
            const { apiFetcher } = useApiClient();
            const targetIndex = this.items.findIndex((item) => item.id === id);

            if (targetIndex === -1) {
                return;
            }

            try {
                const response = await apiFetcher<IMediaItem>(
                    `/api/bricks/media/${encodeURIComponent(id)}/`,
                    {
                        method: 'PATCH',
                        body: meta,
                    }
                );

                const updatedItem = normalizeMediaItem(response);

                this.items.splice(targetIndex, 1, updatedItem);
            } catch (error) {
                console.error('[Media Store] Failed to update meta:', error);
            }
        },

        /**
         * Очищает список медиа в сторе.
         */
        clearAll(): void {
            this.items = [];
        },
    },
});
