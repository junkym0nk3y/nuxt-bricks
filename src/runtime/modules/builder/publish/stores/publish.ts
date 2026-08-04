import { defineStore } from 'pinia';
import type { Composer } from 'vue-i18n';
import { useNuxtApp } from '#imports';
import type { IBricksSchema } from '../../../common/types/brick';
import type {
    IUpdatePagePayload,
    IPublishedPage,
    TPublishedPageSummary,
    TPublishFormState,
} from '../../../common/types/bricks-api';
import type { IPublishOperationOptions } from '../types/publishStore';
import type { IBricksPageAddress } from '../../../common/types/pageAddress';
import { getPageAddressKey, toPageAddress } from '../../../common/utils/bricks/pageAddress';
import { buildDefaultFormState, buildEditFormState, normalizeFormState } from '../utils/formState';
import { beginActiveWrite, endActiveWrite } from '../utils/activeWrites';
import { ensureAllPagesLoaded, runLoadAllPages } from '../utils/pagesLoad';
import { runCreatePage, runDuplicatePage } from '../utils/pageLibraryWrite';
import { validatePublishFormState } from '../utils/formValidation';
import { requirePageRevision, toPageWriteError } from '../utils/requestErrors';
import { restorePageVersionWithPrecondition } from '../utils/pageVersionRestore';
import {
    runPublishCurrentPage,
    runPublishPage,
    runSaveCurrentPageAsCopy,
} from '../utils/currentPageWrite';
import { updatePageRequest, patchPageRequest, deletePageRequest } from '../utils/publishApi';

/**
 * Переводит ключ через глобальный i18n (стор не имеет setup-контекста).
 * `$i18n` резолвится лениво на каждый вызов — безопасно при любом порядке плагинов.
 */
function t(key: string): string {
    const i18n = useNuxtApp().$i18n as Composer | undefined;
    return i18n ? i18n.t(key) : key;
}

/**
 * Pinia-стор для публикации, черновиков и загрузки страниц лендинга.
 * API-слой — в `utils/publishApi.ts`, валидация — в `utils/formValidation.ts`,
 * превью — в `composables/usePublishPreview.ts`.
 */
export const usePublishStore = defineStore('bricksPublish', {
    state: () => ({
        // Список — сводки без schema (editorial-список лёгкий); полная страница
        // со схемой запрашивается point-lookup'ом fetchPageById по необходимости
        publishedPages: [] as TPublishedPageSummary[],
        currentFormState: buildDefaultFormState(),
        validationErrors: {} as Record<string, string>,
        generalError: '',
        // Реестр незавершённых операций записи — см. `utils/activeWrites`
        activeWriteIds: [] as number[],
        nextWriteId: 0,
        editingPageId: null as string | number | null,
        lastSuccessfulSaveAt: 0,
        // Номер последнего стартовавшего запроса списка — им отсекаются ответы,
        // пришедшие не в том порядке, в каком уходили (см. loadAllPages)
        pagesRequestId: 0,
        // Момент последнего полного ответа сервера; `null` — список не загружали.
        // Отдельно от длины массива: пустой список законен (новая страница)
        pagesLoadedAt: null as number | null,
    }),

    getters: {
        /**
         * Идёт ли запись текущего лендинга.
         */
        isSubmitting: (state): boolean => state.activeWriteIds.length > 0,

        /**
         * Находит страницу по идентификатору.
         */
        getPageById: (state) => (id: string | number) => {
            return state.publishedPages.find((page) => String(page.id) === String(id));
        },

        /**
         * Находит страницу по адресу. По адресу, а не по имени: имя уникально
         * только внутри своего префикса, и поиск по нему возвращал бы
         * произвольную из одноимённых страниц.
         */
        getPageByAddress: (state) => (address: IBricksPageAddress) => {
            const key = getPageAddressKey(address);

            return state.publishedPages.find(
                (page) => getPageAddressKey(toPageAddress(page.pagename, page.urlPrefix)) === key
            );
        },

        /**
         * Проверяет, свободен ли адрес, учитывая возможное исключение по id.
         */
        isAddressAvailable:
            (state) => (address: IBricksPageAddress, excludeId?: string | number) => {
                const key = getPageAddressKey(address);

                return !state.publishedPages.some(
                    (page) =>
                        getPageAddressKey(toPageAddress(page.pagename, page.urlPrefix)) === key &&
                        String(page.id) !== String(excludeId)
                );
            },
    },

    actions: {
        /**
         * Открывает операцию записи текущего лендинга — см. `utils/activeWrites`.
         *
         * @returns Идентификатор операции либо `null`, если запись уже идёт.
         */
        beginWrite(): number | null {
            return beginActiveWrite(this);
        },

        /**
         * Закрывает операцию записи по её идентификатору.
         *
         * @param writeId - Идентификатор, выданный `beginWrite`.
         */
        endWrite(writeId: number): void {
            endActiveWrite(this, writeId);
        },

        /**
         * Забывает незавершённые операции при смене сессии билдера. Запрос при этом
         * продолжает лететь, и его исход дойдёт до пользователя тостом с меткой
         * страницы — но новая страница не должна ни показывать индикатор чужой
         * записи, ни ждать её конца, чтобы сохраниться.
         */
        resetActiveWrites(): void {
            this.activeWriteIds = [];
        },

        /**
         * Полностью заменяет состояние формы публикации (например, при восстановлении черновика).
         *
         * @param formState - Новое состояние формы.
         */
        setCurrentFormState(formState: TPublishFormState): void {
            this.currentFormState = normalizeFormState(formState);
        },

        /**
         * Публикует новую страницу — см. `utils/currentPageWrite.runPublishPage`.
         *
         * @param schema - Схема лендинга.
         * @param formState - Данные формы публикации.
         * @returns ID созданной страницы.
         */
        async publishPage(schema: IBricksSchema, formState: TPublishFormState): Promise<number> {
            return await runPublishPage(this, schema, formState);
        },

        /**
         * Синхронизирует страницу в локальном списке: заменяет существующую
         * запись ответом сервера (свежие updatedAt/revision) либо добавляет новую.
         *
         * @param page - Нормализованная страница из ответа API.
         */
        syncPageInList(page: IPublishedPage): void {
            // Список хранит сводки — schema из ответа PUT/PATCH в стор не кладём
            const { schema: _schema, isPreview: _isPreview, ...summary } = page;
            const index = this.publishedPages.findIndex(
                (existing) => String(existing.id) === String(page.id)
            );

            if (index === -1) {
                this.publishedPages = [summary, ...this.publishedPages];
            } else {
                this.publishedPages.splice(index, 1, summary);
            }

            this.invalidatePendingPagesLoad();
        },

        /**
         * Обесценивает уже летящие запросы списка. Локальная запись свежее любого
         * GET'а, стартовавшего до неё: без этого ответ такого GET'а возвращал список
         * без только что созданной копии и с прежней revision — страница пропадала
         * из дашборда, а следующее сохранение падало ложным 409 (находка ревью:
         * счётчик сам по себе упорядочивал только GET относительно GET).
         */
        invalidatePendingPagesLoad(): void {
            this.pagesRequestId += 1;
        },

        /**
         * Обновляет страницу и синхронизирует её в локальном списке. PUT всегда
         * идёт с precondition (`requirePageRevision`): при конфликте — 409,
         * список обновляется (toPageWriteError), повтор перезапишет осознанно.
         *
         * @param id - Идентификатор страницы.
         * @param schema - Схема лендинга.
         * @param formState - Данные формы публикации.
         */
        async updatePage(
            id: string | number,
            schema: IBricksSchema,
            formState: TPublishFormState
        ): Promise<void> {
            const expectedRevision = requirePageRevision(
                this.getPageById(id),
                t('bricks.publish.toasts.savePageFailed')
            );

            try {
                const normalized = await updatePageRequest(id, schema, formState, expectedRevision);
                this.syncPageInList(normalized);
            } catch (error: unknown) {
                console.error('[Publish Store] Failed to update page:', error);
                throw await toPageWriteError(error, () => this.loadAllPages());
            }
        },

        /**
         * Частично обновляет страницу и синхронизирует её в локальном списке.
         * Конфликт precondition (payload с expectedRevision) обрабатывается
         * как в updatePage.
         *
         * @param id - Идентификатор страницы.
         * @param payload - Частичный payload обновления.
         */
        async patchPage(id: string | number, payload: IUpdatePagePayload): Promise<IPublishedPage> {
            try {
                const normalized = await patchPageRequest(id, payload);
                this.syncPageInList(normalized);

                return normalized;
            } catch (error: unknown) {
                console.error('[Publish Store] Failed to patch page:', error);
                throw await toPageWriteError(error, () => this.loadAllPages());
            }
        },

        /**
         * Откатывает страницу к версии (обязательный revision-precondition) —
         * см. `restorePageVersionWithPrecondition`.
         *
         * @param id - Идентификатор страницы.
         * @param versionId - Идентификатор версии.
         */
        async restorePageVersion(id: string | number, versionId: number): Promise<IPublishedPage> {
            return restorePageVersionWithPrecondition(
                this,
                id,
                versionId,
                t('bricks.publish.dashboard.details.versions.toasts.restoreFailed')
            );
        },

        /**
         * Удаляет страницу из БД и локального списка.
         *
         * @param id - Идентификатор страницы.
         */
        async deletePage(id: string | number): Promise<void> {
            try {
                await deletePageRequest(id);
                console.log('[Publish Store] Page deleted successfully');

                const index = this.publishedPages.findIndex(
                    (page) => String(page.id) === String(id)
                );
                if (index !== -1) {
                    this.publishedPages.splice(index, 1);
                }

                this.invalidatePendingPagesLoad();
            } catch (error: unknown) {
                console.error('[Publish Store] Failed to delete page:', error);
                // Через ту же политику, что update/patch/restore: обрыв по таймауту
                // не означает, что страница не удалена — по освежённому списку это
                // видно, а иначе удалённая страница осталась бы в дашборде и повтор
                // получил бы 404 (находка ревью)
                throw await toPageWriteError(error, () => this.loadAllPages());
            }
        },

        /**
         * Загружает список всех страниц.
         *
         * Ошибку только бросает: `generalError` — поле формы публикации, и запись
         * туда доносила текст чужой страницы до открытой. Запрос списка уходит из
         * bootstrap'а сессии, поэтому падение загрузки на покинутой странице
         * подсвечивало ошибку в сайдбаре той, что уже открыта. Каждый вызывающий
         * обрабатывает отказ сам: дашборд — своим тостом, bootstrap сессии —
         * блокирующим экраном, `toPageWriteError` — конфликтом ревизии, освежение
         * после создания (`runPublishPage`) — предупреждением в консоль.
         */
        async loadAllPages(): Promise<void> {
            await runLoadAllPages(this);
        },

        /**
         * Гарантирует полный список страниц, не запрашивая его повторно, — см.
         * `utils/pagesLoad`. Ошибку не глушит: её смысл разный у открытия сессии
         * и у селектора страниц.
         */
        async ensurePagesLoaded(): Promise<void> {
            await ensureAllPagesLoaded(this, t('bricks.publish.toasts.loadPageFailed'));
        },

        /**
         * Обновляет отдельное поле в текущих настройках.
         *
         * @param field - Название поля.
         * @param value - Значение поля.
         */
        setCurrentFormField<K extends keyof TPublishFormState>(
            field: K,
            value: TPublishFormState[K]
        ): void {
            this.currentFormState = {
                ...this.currentFormState,
                [field]: value,
            };
        },

        /**
         * Сбрасывает текущие настройки к значениям по умолчанию.
         */
        resetCurrentFormState(): void {
            this.currentFormState = buildDefaultFormState();
        },

        /**
         * Очищает ошибки валидации и общую ошибку.
         */
        clearErrors(): void {
            this.validationErrors = {};
            this.generalError = '';
        },

        /**
         * Очищает ошибку валидации для конкретного поля.
         *
         * @param field - Поле формы публикации.
         */
        clearValidationError(field: keyof TPublishFormState): void {
            const key = String(field);
            if (!this.validationErrors[key]) {
                return;
            }

            this.validationErrors = Object.fromEntries(
                Object.entries(this.validationErrors).filter(([fieldKey]) => fieldKey !== key)
            );

            if (Object.keys(this.validationErrors).length === 0) {
                this.generalError = '';
            }
        },

        /**
         * Начинает новую сессию публикации.
         */
        startNewPublish(): void {
            this.resetCurrentFormState();
            this.editingPageId = null;
            this.clearErrors();
        },

        /**
         * Загружает настройки существующей страницы и переводит стор в режим редактирования.
         *
         * @param pageId - Идентификатор страницы.
         */
        startEditingPage(pageId: string | number): void {
            const page = this.getPageById(pageId);
            if (!page) {
                console.error('[Publish Store] startEditingPage: page not found', pageId);
                return;
            }

            this.currentFormState = buildEditFormState(page);
            this.editingPageId = pageId;
            this.clearErrors();
        },

        /**
         * Валидирует текущие настройки перед превью или публикацией.
         *
         * @returns Пройдена ли валидация.
         */
        validateCurrentFormState(): boolean {
            const { formState, errors } = validatePublishFormState(
                this.currentFormState,
                (address) =>
                    this.isAddressAvailable(
                        address,
                        this.editingPageId !== null ? this.editingPageId : undefined
                    )
            );

            if (formState !== this.currentFormState) {
                this.currentFormState = formState;
            }

            this.validationErrors = errors;
            this.generalError =
                Object.keys(errors).length > 0 ? t('bricks.publish.fillRequired') : '';

            return Object.keys(errors).length === 0;
        },

        /**
         * Публикует или обновляет текущий лендинг.
         *
         * @param schema - Схема лендинга из канваса.
         * @param options - Проверка актуальности сессии-инициатора.
         * @returns ID страницы или null при ошибке.
         */
        async publishCurrentPage(
            schema: IBricksSchema,
            options?: IPublishOperationOptions
        ): Promise<string | number | null> {
            return await runPublishCurrentPage(
                this,
                schema,
                t('bricks.publish.publishFailed'),
                options
            );
        },

        /**
         * Создаёт новую страницу-черновик (модалка создания дашборда) — см.
         * `utils/pageLibraryWrite.runCreatePage`. Схема приходит от вызывающего:
         * пустой холст или разобранный JSON-файл.
         *
         * @param schema - Схема новой страницы.
         * @param formState - Meta-поля новой страницы.
         * @returns ID созданной страницы.
         */
        async createPage(schema: IBricksSchema, formState: TPublishFormState): Promise<number> {
            return await runCreatePage(this, schema, formState);
        },

        /**
         * Дублирует произвольную страницу — см.
         * `utils/pageLibraryWrite.runDuplicatePage`.
         *
         * @param id - Идентификатор исходной страницы.
         * @returns ID созданной копии.
         */
        async duplicatePage(id: string | number): Promise<number> {
            return await runDuplicatePage(
                this,
                id,
                t('bricks.publish.dashboard.toasts.duplicateFailed')
            );
        },

        /**
         * Сохраняет текущую конфигурацию как копию страницы; сама синхронизирует список (без loadAllPages()).
         *
         * @param schema - Схема лендинга из канваса.
         * @param options - Проверка актуальности сессии-инициатора.
         * @returns Нормализованная страница копии или null при ошибке.
         */
        async saveCurrentPageAsCopy(
            schema: IBricksSchema,
            options?: IPublishOperationOptions
        ): Promise<IPublishedPage | null> {
            return await runSaveCurrentPageAsCopy(
                this,
                schema,
                t('bricks.publish.copyFailedRetry'),
                options
            );
        },
    },
});
