// #region Imports
import { defineStore } from 'pinia';
import type { Composer } from 'vue-i18n';
import { useNuxtApp } from '#imports';
import type {
    IBricksMediaOptimization,
    IMediaItem,
    IMediaUpdateCategoryRequest,
    IMediaUpdateMetaRequest,
} from '../../../common/types/media';
import { useApiClient } from '../../../common/composables/useApiClient';
import { isRequestTimeoutError } from '../../../common/utils/apiRequestPolicy';
import { isMediaListResponse, toMediaRequestError } from '../utils/requestErrors';
import { normalizeMediaItem } from '../utils/normalizeMediaItem';
import { requestMediaStorageImport } from '../utils/storageImport';
import type { IMediaStorageImportResult } from '../types/storageImport';
import { useMediaWriteOrderStore } from './mediaWriteOrder';
import { BRICKS_MEDIA_UPLOAD_TIMEOUT_MS } from '../../../common/constants/apiTimeouts';
import { ALL_MEDIA_CATEGORIES_FILTER } from '../../../common/constants/mediaCategories';
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
 * Летящий обход хранилища — по одному на экземпляр стора.
 *
 * Держится вне state: это Promise, а state стора сериализуется. Ключ —
 * сам стор, а не модуль: один общий Promise смешал бы SSR-запросы разных
 * пользователей, отдав одному состав медиатеки, полученный для другого.
 */
const pendingStorageImports = new WeakMap<object, Promise<IMediaStorageImportResult>>();
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
        // Пробовали ли уже подтянуть в медиатеку содержимое бакета. Импорт имеет
        // смысл ровно один раз за сессию: он идемпотентен, но обходит весь
        // managed-префикс хранилища, и повторять этот обход на каждое открытие
        // пустой галереи незачем.
        hasAttemptedStorageImport: false,
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

                const items = response.items.length
                    ? response.items
                    : await this.importFromStorage();

                if (requestId !== this.itemsRequestId) {
                    return;
                }

                this.items = items.map(normalizeMediaItem);
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
         * Подтягивает в медиатеку файлы, уже лежащие в хранилище публикации.
         * Вызывается, когда список пришёл пустым.
         *
         * Обход хранилища идёт не чаще раза за сессию — но только если попытка
         * состоялась. Временный отказ (обрыв сети, 5xx) флаг не выставляет:
         * иначе один сбой оставлял бы администратора с пустой галереей до
         * перезагрузки страницы. Отказ по правам окончателен.
         *
         * @returns Состав медиатеки после импорта; пустой массив — импортировать
         * было нечего или попытка не удалась.
         */
        async importFromStorage(): Promise<IMediaItem[]> {
            // Второй вызов, пока первый ещё летит, ждёт тот же ответ, а не
            // получает пустой список: иначе он объявлял бы себя последним
            // запросом, показывал пустую галерею — и результат уже успешного
            // импорта отбрасывался бы как устаревший
            const pending = pendingStorageImports.get(this);

            if (pending) {
                return (await pending).items;
            }

            if (this.hasAttemptedStorageImport) {
                return [];
            }

            this.hasAttemptedStorageImport = true;

            const request = requestMediaStorageImport(useApiClient().apiFetcher);
            pendingStorageImports.set(this, request);

            try {
                const result = await request;

                if (result.isRetryable) {
                    this.hasAttemptedStorageImport = false;
                }

                return result.items;
            } finally {
                pendingStorageImports.delete(this);
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
         * Закрывает операцию по элементу и перечитывает список, если сверка
         * назрела: по элементу был отказ и других летящих записей не осталось.
         *
         * Сверка нужна не «на всякий случай»: отказ более свежей записи оставляет
         * успех более ранней неприменённым, потому что устаревшей она считается
         * по порядку старта, а кто победил на сервере — неизвестно. Ждать тишины
         * обязательно: GET, пущенный сразу из `catch`, обогнал бы незавершённый
         * PATCH и прочитал состояние до него.
         *
         * @param id - Идентификатор медиа.
         * @param failed - Операция завершилась отказом.
         */
        finishItemOperation(id: number, failed: boolean): void {
            if (useMediaWriteOrderStore().endItemOperation(id, failed)) {
                this.reloadItemsDetached();
            }
        },

        /**
         * Приводит отказ записи к пользовательскому виду.
         *
         * Перечитывание списка отсюда снято: у операций по элементу его отпускает
         * `finishItemOperation`. Загрузка файла остаётся исключением и сверяется
         * сама: её id до ответа неизвестен, а значит и элемента, по которому можно
         * ждать тишины, ещё нет.
         *
         * @param error - Исходная ошибка запроса.
         * @param method - HTTP-метод запроса.
         * @param fallbackMessage - Локализованное сообщение на случай молчащей ошибки.
         * @returns Ошибка для показа пользователю.
         */
        toWriteError(error: unknown, method: string, fallbackMessage: string): Error {
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
         * Загружает файл в медиа-библиотеку одним запросом: сервер кладёт файл
         * в хранилище публикации и регистрирует метаданные в БД
         * (POST /api/bricks/media/upload). Судьбу файла при отказе решает
         * сервер: удаляет только когда запись гарантированно не создана, иначе
         * повторяет регистрацию. Ошибка пробрасывается вызывающему.
         *
         * @param file - Файл, который нужно загрузить.
         * @param category - Категория, которая будет назначена; без неё файл
         *   загружается без категории.
         * @returns Промис с сохранённым медиа-элементом.
         */
        async uploadFile(
            file: File,
            category?: string | null,
            optimization?: IBricksMediaOptimization
        ): Promise<IMediaItem> {
            const { apiFetcher } = useApiClient();
            this.uploadingCount += 1;

            try {
                const resolvedCategory =
                    category && category !== ALL_MEDIA_CATEGORIES_FILTER ? category : null;

                const formData = new FormData();
                formData.append('file', file);

                // Поле не отправляется вовсе, когда категории нет: пустая строка
                // в multipart дошла бы до валидатора как невалидный slug
                if (resolvedCategory) {
                    formData.append('category', resolvedCategory);
                }

                // Параметры уходят только когда выбраны: без полей сервер берёт
                // дефолты конфига, и передавать их клиентской копией незачем
                if (optimization) {
                    formData.append('format', optimization.format);
                    formData.append('quality', String(optimization.quality));
                    formData.append('maxWidth', String(optimization.maxWidth));
                }

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

                // Загрузка сверяется немедленно, а не через `endItemOperation`:
                // ждать тишины по элементу не выйдет — при отказе id записи так и
                // не стал известен. Сверять при этом стоит только неизвестный
                // исход: определённый отказ означает, что файла в медиатеке нет
                if (isRequestTimeoutError(error)) {
                    this.reloadItemsDetached();
                }

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
            const writeOrder = useMediaWriteOrderStore();
            writeOrder.beginItemOperation(id);

            try {
                await apiFetcher(`/api/bricks/media/${encodeURIComponent(id)}/`, {
                    method: 'DELETE',
                });
            } catch (error: unknown) {
                console.error('[Media Store] Failed to delete item:', error);
                this.finishItemOperation(id, true);

                throw this.toWriteError(error, 'DELETE', t('bricks.media.deleteFailed'));
            }

            this.invalidatePendingItemsLoad();
            this.items = this.items.filter((item) => item.id !== id);
            writeOrder.forgetItem(id);
            this.finishItemOperation(id, false);
        },

        /**
         * Обновляет категорию конкретного медиафайла. Ошибка пробрасывается
         * вызывающему: без этого смена категории выглядела бы применённой, хотя
         * сервер её отклонил.
         *
         * @param id - Идентификатор медиа.
         * @param category - Новая категория; null снимает её с файла.
         */
        async updateItemCategory(id: number, category: string | null): Promise<void> {
            const { apiFetcher } = useApiClient();

            if (!this.items.some((item) => item.id === id)) {
                return;
            }

            const writeOrder = useMediaWriteOrderStore();
            const writeId = writeOrder.startItemWrite(id, 'category');
            // Поколение НАЗНАЧАЕМОЙ категории: удаление любой другой этому PATCH'у
            // не противоречит
            const categoryGeneration = writeOrder.readCategoryGeneration(category);
            let response: IMediaItem;

            writeOrder.beginItemOperation(id);

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
                this.finishItemOperation(id, true);

                throw this.toWriteError(error, 'PATCH', t('bricks.media.updateCategoryFailed'));
            }

            // Отказ вызывающему докладывается всегда, а вот ПРИМЕНЯЕТСЯ только
            // актуальный ответ: запрос удался, устарело его значение
            const isCurrent =
                writeOrder.isCurrentItemWrite(id, 'category', writeId) &&
                categoryGeneration === writeOrder.readCategoryGeneration(category);

            if (isCurrent) {
                this.applyItemPatch(id, { category: normalizeMediaItem(response).category });
            }

            this.finishItemOperation(id, false);
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

            // Номер берётся на каждое отправляемое поле: PATCH'и filename и alt
            // независимы, и устаревший ответ одного не должен снимать правку
            // другого — как и наоборот
            const writeOrder = useMediaWriteOrderStore();
            const filenameWriteId =
                meta.filename === undefined ? null : writeOrder.startItemWrite(id, 'filename');
            const altWriteId = meta.alt === undefined ? null : writeOrder.startItemWrite(id, 'alt');
            let response: IMediaItem;

            writeOrder.beginItemOperation(id);

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
                this.finishItemOperation(id, true);

                throw this.toWriteError(error, 'PATCH', t('bricks.media.updateMetaFailed'));
            }

            const updatedItem = normalizeMediaItem(response);
            const patch: Partial<IMediaItem> = {};

            if (
                filenameWriteId !== null &&
                writeOrder.isCurrentItemWrite(id, 'filename', filenameWriteId)
            ) {
                patch.filename = updatedItem.filename;
            }

            if (altWriteId !== null && writeOrder.isCurrentItemWrite(id, 'alt', altWriteId)) {
                patch.alt = updatedItem.alt;
            }

            // Устаревший ответ ничего не применяет: запрос удался, но обе его
            // правки уже перебиты более свежими
            if (Object.keys(patch).length > 0) {
                this.applyItemPatch(id, patch);
            }

            this.finishItemOperation(id, false);
        },

        /**
         * Отражает серверное снятие категории с её файлов после удаления
         * категории.
         *
         * Живёт здесь, а не в сторе категорий: список файлов принадлежит
         * этому стору, и правка его извне обошла бы обесценивание летящего
         * GET, из-за которого файлы удалённой категории исчезли бы из всех
         * фильтров до перезагрузки.
         *
         * @param slug - Удалённая категория.
         */
        clearCategoryLocally(slug: string): void {
            this.invalidatePendingItemsLoad();
            // Летящие назначения ЭТОЙ категории обесцениваются: их ответ несёт
            // slug, которого больше нет, и вернул бы удалённую категорию в
            // элемент — как раз то, от чего это снятие и защищает. Назначения
            // других категорий удалению не противоречат и остаются в силе
            useMediaWriteOrderStore().invalidateCategory(slug);
            this.items = this.items.map((item) =>
                item.category === slug ? { ...item, category: null } : item
            );
        },
    },
});
