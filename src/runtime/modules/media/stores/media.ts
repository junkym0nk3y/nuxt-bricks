// #region Imports
import { defineStore } from 'pinia';
import type {
    IMediaItem,
    IMediaListResponse,
    IMediaUpdateCategoryRequest,
    IMediaUpdateMetaRequest,
} from '../types/media';
import { useApiClient } from '../../common/composables/useApiClient';
import { toCamelCase, toSnakeCase } from '../../common/utils/case-transform';
// #endregion

// #region Data
const DEFAULT_MEDIA_CATEGORY = 'other';
const DEFAULT_MEDIA_MIME_TYPE = 'image/png';
// #endregion

// #region Helpers
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
                const message =
                    (error as { data?: { message?: string } })?.data?.message ||
                    (error instanceof Error ? error.message : 'Не удалось загрузить медиа');
                const formatted = `GET /api/bricks/media: ${message}`;
                console.error('[Media Store] Failed to load items from backend:', error);
                this.items = [];
                throw new Error(formatted);
            }
        },

        /**
         * Загружает файл в S3 и сохраняет метаданные в Django backend.
         * Двухэтапная загрузка:
         * 1. POST /mock-api/s3-image — загрузка файла в S3, получение URL
         * 2. POST /api/bricks/media/ — сохранение метаданных в Django
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

                // Читаем svgContent из файла на клиенте (если SVG)
                let svgContent: string | null = null;

                if (file.type === 'image/svg+xml') {
                    try {
                        svgContent = await file.text();
                    } catch (error) {
                        console.warn('[Media Store] Failed to read SVG content:', error);
                    }
                }

                // Этап 1: Загрузка файла в S3
                const formData = new FormData();
                formData.append('file', file);

                const s3Response = await apiFetcher<{
                    success: boolean;
                    url: string;
                    filename: string;
                    size: number;
                    mimeType: string;
                }>('/mock-api/s3-image', {
                    method: 'POST',
                    body: formData,
                });

                if (!s3Response.success || !s3Response.url) {
                    throw new Error('Failed to upload file to S3');
                }

                // Этап 2: Сохранение метаданных в Django (snake_case для backend)
                const response = await apiFetcher<IMediaItem>('/api/bricks/media/', {
                    method: 'POST',
                    body: toSnakeCase({
                        url: s3Response.url,
                        filename: s3Response.filename,
                        size: s3Response.size,
                        mimeType: s3Response.mimeType,
                        category: resolvedCategory,
                        svgContent,
                    }),
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
         * Удаляет медиафайл из S3 и метаданные из Django.
         * Двухэтапное удаление:
         * 1. POST /mock-api/s3-delete — удаление файла из S3
         * 2. DELETE /api/bricks/media/:id — удаление метаданных из Django
         *
         * @param id - Идентификатор удаляемого медиафайла.
         */
        async removeItem(id: number): Promise<void> {
            const { apiFetcher } = useApiClient();
            const target = this.items.find((item) => item.id === id);

            if (!target) {
                return;
            }

            try {
                // Этап 1: Удаление файла из S3
                await apiFetcher<{ success: boolean }>('/mock-api/s3-delete', {
                    method: 'POST',
                    body: { url: target.url },
                });
            } catch (error) {
                console.error('[Media Store] Failed to delete from S3:', error);
                // Продолжаем удаление из Django даже если S3 не удалось
            }

            try {
                // Этап 2: Удаление метаданных из Django
                await apiFetcher(`/api/bricks/media/${encodeURIComponent(id)}/`, {
                    method: 'DELETE',
                });
            } catch (error) {
                console.error('[Media Store] Failed to delete from backend:', error);
            }

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
