/**
 * Стор категорий медиатеки.
 *
 * Отдельно от `media.ts` по границе сущности: у категорий свои ручки, свой
 * список и свой номер запроса, они не пересекаются с файлами ни одним вызовом, а
 * вместе файл перерастал потолок в 500 строк. Единственная связь — удаление
 * категории: сервер той же транзакцией снимает её со своих файлов (`category`
 * становится `null`), и то же изменение нужно отразить в уже показанном списке
 * файлов.
 */

// #region Imports
import { defineStore } from 'pinia';
import type { Composer } from 'vue-i18n';
import { useNuxtApp } from '#imports';
import type {
    IMediaCategory,
    IMediaCategoryCreateRequest,
    IMediaCategoryDeleteResponse,
} from '../../../common/types/media';
import { useApiClient } from '../../../common/composables/useApiClient';
import { toCamelCase } from '../../../common/utils/case-transform';
import { isRequestTimeoutError } from '../../../common/utils/apiRequestPolicy';
import { isMediaCategoryListResponse, toMediaRequestError } from '../utils/requestErrors';
import { useMediaStore } from './media';
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
// #endregion

export const useMediaCategoriesStore = defineStore('bricksMediaCategories', {
    state: () => ({
        categories: [] as IMediaCategory[],
        // Номер последнего стартовавшего запроса — тем же способом, что у списка
        // медиа: локальная вставка чипа обгоняет летящий GET, и его ответ иначе
        // скрыл бы созданную категорию или вернул удалённую
        categoriesRequestId: 0,
    }),

    actions: {
        /**
         * Загружает категории медиатеки.
         *
         * Отказ не опустошает список — по той же причине, что у `loadItems`:
         * уже показанный ряд чипов переживает transient-отказ, а сообщение
         * получает вызывающий.
         */
        async loadCategories(): Promise<void> {
            const { apiFetcher } = useApiClient();
            const requestId = ++this.categoriesRequestId;

            try {
                const response = await apiFetcher<unknown>('/api/bricks/media/categories');

                if (!isMediaCategoryListResponse(response)) {
                    throw new Error(t('bricks.media.categoryListResponseInvalid'));
                }

                if (requestId !== this.categoriesRequestId) {
                    return;
                }

                this.categories = response.items.map((item) => toCamelCase<IMediaCategory>(item));
            } catch (error: unknown) {
                // Отказ вытесненного запроса вызывающему не докладывается: тост об
                // устаревшей попытке накрыл бы результат более свежей
                if (requestId !== this.categoriesRequestId) {
                    return;
                }

                console.error('[Media Store] Failed to load categories:', error);

                throw toMediaRequestError(error, 'GET', t, t('bricks.media.categoryLoadFailed'));
            }
        },

        /**
         * Обесценивает уже летящий запрос категорий: его ответ ничего не знает о
         * локальной вставке или удалении чипа.
         */
        invalidatePendingCategoriesLoad(): void {
            this.categoriesRequestId += 1;
        },

        /**
         * Отпускает перечитывание категорий — по той же причине, что у списка
         * медиа: после обрыва записи по потолку ожидания исход неизвестен, и это
         * единственная возможность его увидеть. Отказ гасится здесь же.
         */
        reloadCategoriesDetached(): void {
            this.loadCategories().catch((error: unknown) => {
                console.warn('[Media Store] Categories reload after write timeout failed:', error);
            });
        },

        /**
         * Приводит отказ записи категории к пользовательскому виду. Отдельно от
         * `toWriteError`: тот перечитывает список файлов, а после обрыва
         * POST/DELETE категории сверять нужно ряд чипов — иначе созданная
         * категория осталась бы невидимой, а удалённая видимой, хотя сервер
         * операцию уже применил.
         *
         * @param error - Исходная ошибка запроса.
         * @param method - HTTP-метод запроса.
         * @param fallbackMessage - Локализованное сообщение на случай молчащей ошибки.
         * @returns Ошибка для показа пользователю.
         */
        toCategoryWriteError(error: unknown, method: string, fallbackMessage: string): Error {
            if (isRequestTimeoutError(error)) {
                this.reloadCategoriesDetached();
                // Категория могла быть удалена вместе со снятием её с файлов —
                // список файлов после этого тоже недостоверен
                useMediaStore().reloadItemsDetached();
            }

            return toMediaRequestError(error, method, t, fallbackMessage);
        },

        /**
         * Создаёт категорию и добавляет её в конец ряда.
         *
         * Список не перечитывается: ответ несёт созданную запись целиком, а
         * перечитывание обесценило бы её локальную вставку тем же способом, каким
         * это происходит со списком медиа (см. invalidatePendingItemsLoad).
         *
         * @param label - Подпись, введённая пользователем; slug считает сервер
         *   nuxt-bricks (внешний backend получает уже готовое значение).
         * @returns Созданная (или уже существовавшая) категория.
         */
        async createCategory(label: string): Promise<IMediaCategory> {
            const { apiFetcher } = useApiClient();
            let response: IMediaCategory;

            try {
                response = await apiFetcher<IMediaCategory>('/api/bricks/media/categories', {
                    method: 'POST',
                    body: { label } satisfies IMediaCategoryCreateRequest,
                });
            } catch (error: unknown) {
                console.error('[Media Store] Failed to create category:', error);

                throw this.toCategoryWriteError(
                    error,
                    'POST',
                    t('bricks.media.categoryCreateFailed')
                );
            }

            const category = toCamelCase<IMediaCategory>(response);

            this.invalidatePendingCategoriesLoad();

            const existingIndex = this.categories.findIndex((item) => item.slug === category.slug);

            if (existingIndex === -1) {
                this.categories.push(category);
            } else {
                this.categories.splice(existingIndex, 1, category);
            }

            return category;
        },

        /**
         * Удаляет категорию; сервер той же транзакцией снимает её со своих
         * файлов, поэтому локально им правится категория без запроса.
         *
         * @param slug - Удаляемая категория.
         * @returns Сколько файлов осталось без категории.
         */
        async deleteCategory(slug: string): Promise<number> {
            const { apiFetcher } = useApiClient();
            let response: IMediaCategoryDeleteResponse;

            try {
                response = await apiFetcher<IMediaCategoryDeleteResponse>(
                    `/api/bricks/media/categories/${encodeURIComponent(slug)}`,
                    { method: 'DELETE' }
                );
            } catch (error: unknown) {
                console.error('[Media Store] Failed to delete category:', error);

                throw this.toCategoryWriteError(
                    error,
                    'DELETE',
                    t('bricks.media.categoryDeleteFailed')
                );
            }

            this.invalidatePendingCategoriesLoad();
            this.categories = this.categories.filter((item) => item.slug !== slug);
            // Локальное зеркало серверного снятия категории: без него файлы
            // удалённой категории пропали бы из всех фильтров до перезагрузки
            useMediaStore().clearCategoryLocally(slug);

            return response.clearedCount ?? 0;
        },
    },
});
