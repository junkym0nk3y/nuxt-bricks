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
import { DEFAULT_LAYOUT } from '../../../common/utils/bricks/publishedPage';
import {
    buildCopyFormState,
    buildDefaultFormState,
    normalizeFormState,
    resolveDefaultBackgroundColor,
} from '../utils/formState';
import { generateCopyPagename } from '../utils/slugify';
import { validatePublishFormState } from '../utils/formValidation';
import { toPageWriteError } from '../utils/requestErrors';
import {
    publishPageRequest,
    updatePageRequest,
    patchPageRequest,
    deletePageRequest,
    fetchAllPagesRequest,
    fetchPageRequest,
    fetchPageByPagenameRequest,
    restorePageVersionRequest,
} from '../utils/publishApi';

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
        isSubmitting: false,
        editingPageId: null as string | number | null,
        lastSuccessfulSaveAt: 0,
    }),

    getters: {
        /**
         * Находит страницу по идентификатору.
         */
        getPageById: (state) => (id: string | number) => {
            return state.publishedPages.find((page) => String(page.id) === String(id));
        },

        /**
         * Находит страницу по `pagename`.
         */
        getPageByPagename: (state) => (pagename: string) => {
            return state.publishedPages.find((page) => page.pagename === pagename);
        },

        /**
         * Проверяет, свободен ли `pagename`, учитывая возможное исключение по id.
         */
        isPagenameAvailable: (state) => (pagename: string, excludeId?: string | number) => {
            return !state.publishedPages.some(
                (page) => page.pagename === pagename && String(page.id) !== String(excludeId)
            );
        },
    },

    actions: {
        /**
         * Полностью заменяет состояние формы публикации (например, при восстановлении черновика).
         *
         * @param formState - Новое состояние формы.
         */
        setCurrentFormState(formState: TPublishFormState): void {
            this.currentFormState = normalizeFormState(formState);
        },

        /**
         * Публикует новую страницу через API и перезагружает список страниц.
         *
         * @param schema - Схема лендинга.
         * @param formState - Данные формы публикации.
         */
        async publishPage(schema: IBricksSchema, formState: TPublishFormState): Promise<number> {
            try {
                const response = await publishPageRequest(schema, formState);
                console.log('[Publish Store] Page published successfully:', response);

                await this.loadAllPages();

                return response.id;
            } catch (error: unknown) {
                console.error('[Publish Store] Failed to publish page:', error);
                throw error;
            }
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
        },

        /**
         * Обновляет существующую страницу и синхронизирует её в локальном списке.
         * PUT идёт с precondition (revision страницы из списка): если страницу
         * изменили в другом месте — 409, список обновляется (toPageWriteError),
         * пользователь получает понятный тост и осознанно перезаписывает
         * повторным сохранением.
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
            try {
                const expectedRevision = this.getPageById(id)?.revision;
                const normalized = await updatePageRequest(id, schema, formState, expectedRevision);
                console.log('[Publish Store] Page updated successfully');

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
         * Откатывает страницу к сохранённой версии и синхронизирует её в локальном списке
         * (панель деталей обновится реактивно по `updatedAt`).
         *
         * @param id - Идентификатор страницы.
         * @param versionId - Идентификатор версии.
         */
        async restorePageVersion(id: string | number, versionId: number): Promise<IPublishedPage> {
            try {
                const normalized = await restorePageVersionRequest(id, versionId);
                this.syncPageInList(normalized);

                return normalized;
            } catch (error: unknown) {
                console.error('[Publish Store] Failed to restore page version:', error);
                throw error;
            }
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
            } catch (error: unknown) {
                console.error('[Publish Store] Failed to delete page:', error);
                throw error;
            }
        },

        /**
         * Загружает список всех страниц.
         */
        async loadAllPages(): Promise<void> {
            try {
                this.publishedPages = await fetchAllPagesRequest();
            } catch (error: unknown) {
                this.generalError = (error as Error).message;
                console.error('[Publish Store] Failed to load pages:', error);
                throw error;
            }
        },

        /**
         * Загружает страницу по `pagename`.
         *
         * @param pagename - ЧПУ страницы.
         */
        async loadPageByPagename(pagename: string): Promise<IPublishedPage | null> {
            try {
                const page = await fetchPageByPagenameRequest(pagename);

                if (!page) {
                    this.generalError = `GET /api/bricks/public/pages/${pagename}: page is not published`;
                }

                return page;
            } catch (error: unknown) {
                this.generalError = (error as Error).message;
                console.error('[Publish Store] Failed to load page:', error);
                return null;
            }
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

            this.currentFormState = {
                pagename: page.pagename,
                title: page.title,
                description: page.description,
                keywords: page.keywords,
                published: page.published,
                layout: page.layout || DEFAULT_LAYOUT,
                backgroundColor: page.backgroundColor || resolveDefaultBackgroundColor(),
                socialImage: page.socialImage,
                urlPrefix: page.urlPrefix,
                subdomain: page.subdomain,
                createdAt: page.createdAt,
                updatedAt: page.updatedAt,
            };
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
                (pagename) =>
                    this.isPagenameAvailable(
                        pagename,
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
         * @returns ID страницы или null при ошибке.
         */
        async publishCurrentPage(schema: IBricksSchema): Promise<string | number | null> {
            if (!this.validateCurrentFormState()) {
                return null;
            }

            this.isSubmitting = true;
            this.generalError = '';

            try {
                if (this.editingPageId !== null) {
                    await this.updatePage(this.editingPageId, schema, this.currentFormState);
                    this.lastSuccessfulSaveAt = Date.now();
                    return this.editingPageId;
                }

                const createdId = await this.publishPage(schema, this.currentFormState);
                this.lastSuccessfulSaveAt = Date.now();
                return createdId;
            } catch (error: unknown) {
                console.error('[Publish Store] publishCurrentPage failed:', error);
                this.generalError = (error as Error)?.message || t('bricks.publish.publishFailed');
                return null;
            } finally {
                this.isSubmitting = false;
            }
        },

        /**
         * Создаёт новую страницу-черновик с пустой схемой (модалка создания дашборда).
         * `currentFormState` не трогает — работает вне сессии редактора.
         *
         * @param formState - Meta-поля новой страницы.
         * @returns ID созданной страницы.
         */
        async createPage(formState: TPublishFormState): Promise<number> {
            return await this.publishPage({ components: [] }, { ...formState, published: false });
        },

        /**
         * Дублирует произвольную страницу по идентификатору: клонирует meta и схему,
         * создаёт черновик с уникальным `pagename` (суффикс «-copy»).
         * Не трогает `currentFormState` — работает вне сессии редактора.
         *
         * @param id - Идентификатор исходной страницы.
         * @returns ID созданной копии.
         */
        async duplicatePage(id: string | number): Promise<number> {
            const page = this.getPageById(id);
            if (!page) {
                console.error('[Publish Store] duplicatePage: page not found', id);
                throw new Error(t('bricks.publish.dashboard.toasts.duplicateFailed'));
            }

            const copyPagename = generateCopyPagename(page.pagename, (candidate) =>
                this.isPagenameAvailable(candidate)
            );

            // Сводка списка схему не несёт — исходная схема запрашивается point-lookup'ом
            const fullPage = await fetchPageRequest(page.id);

            return await this.publishPage(fullPage.schema, buildCopyFormState(page, copyPagename));
        },

        /**
         * Сохраняет текущую конфигурацию как копию страницы; сама синхронизирует список (без loadAllPages()).
         *
         * @param schema - Схема лендинга из канваса.
         * @returns Нормализованная страница копии или null при ошибке.
         */
        async saveCurrentPageAsCopy(schema: IBricksSchema): Promise<IPublishedPage | null> {
            const originalFormState = { ...this.currentFormState };
            const originalEditingPageId = this.editingPageId;
            const originalValidationErrors = { ...this.validationErrors };
            const originalGeneralError = this.generalError;

            const copyPagename = generateCopyPagename(originalFormState.pagename, (candidate) =>
                this.isPagenameAvailable(candidate)
            );
            const copyTitle = originalFormState.title
                ? `${originalFormState.title} (copy)`
                : originalFormState.title;

            this.editingPageId = null;
            this.currentFormState = {
                ...originalFormState,
                pagename: copyPagename,
                title: copyTitle,
                published: false,
                createdAt: '',
                updatedAt: '',
            };
            this.validationErrors = {};
            this.generalError = '';

            if (!this.validateCurrentFormState()) {
                this.currentFormState = originalFormState;
                this.editingPageId = originalEditingPageId;
                this.validationErrors = { ...originalValidationErrors };
                this.generalError = originalGeneralError;
                return null;
            }

            this.isSubmitting = true;
            try {
                const created = await publishPageRequest(schema, this.currentFormState);
                this.syncPageInList(created);
                return created;
            } catch (error: unknown) {
                console.error('[Publish Store] saveCurrentPageAsCopy failed:', error);
                this.generalError =
                    (error as Error)?.message || t('bricks.publish.copyFailedRetry');
                return null;
            } finally {
                this.isSubmitting = false;
                this.currentFormState = originalFormState;
                this.editingPageId = originalEditingPageId;
                this.validationErrors = { ...originalValidationErrors };
                this.generalError = originalGeneralError;
            }
        },
    },
});
