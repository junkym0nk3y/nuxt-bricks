import { defineStore } from 'pinia';
import type { BricksSchema } from '../../../common/types/brick';
import type {
    IUpdatePagePayload,
    IPublishedPageSummary,
    IPublishedPage,
    IPreviewStoredPage,
    TPublishFormState,
} from '../../../common/types/bricks-api';
import { useApiClient } from '../../../common/composables/useApiClient';
import { toSnakeCaseShallow } from '../../../common/utils/case-transform';
import {
    DEFAULT_LAYOUT,
    normalizePublishedPage,
} from '../../../common/utils/bricks/publishedPage';
import {
    buildDefaultFormState,
    normalizeFormState,
    resolveDefaultBackgroundColor,
} from '../utils/formState';
import { toRequestError } from '../utils/requestErrors';
import { buildPagePayload } from '../utils/pagePayload';

/**
 * Pinia-стор для публикации, черновиков и загрузки страниц лендинга.
 */
export const usePublishStore = defineStore('bricksPublish', {
    state: () => ({
        publishedPages: [] as IPublishedPage[],
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
         * Публикует новую страницу через API.
         *
         * @param schema - Схема лендинга.
         * @param formState - Данные формы публикации.
         */
        async publishPage(schema: BricksSchema, formState: TPublishFormState): Promise<number> {
            const { apiFetcher } = useApiClient();

            try {
                const response = await apiFetcher<{ id: number; pagename: string }>(
                    '/api/bricks/',
                    {
                        method: 'POST',
                        body: toSnakeCaseShallow(buildPagePayload(schema, formState)),
                    }
                );

                console.log('[Publish Store] Page published successfully:', response);

                // Перезагружаем список страниц
                await this.loadAllPages();

                return response.id;
            } catch (error: unknown) {
                const requestError = toRequestError('POST', '/api/bricks', error);
                console.error('[Publish Store] Failed to publish page:', error);
                throw requestError;
            }
        },

        /**
         * Обновляет существующую страницу.
         *
         * @param id - Идентификатор страницы.
         * @param schema - Схема лендинга.
         * @param formState - Данные формы публикации.
         */
        async updatePage(
            id: string | number,
            schema: BricksSchema,
            formState: TPublishFormState
        ): Promise<void> {
            const { apiFetcher } = useApiClient();

            try {
                await apiFetcher(`/api/bricks/${id}/`, {
                    method: 'PUT',
                    body: toSnakeCaseShallow(buildPagePayload(schema, formState)),
                });

                console.log('[Publish Store] Page updated successfully');

                // Перезагружаем список страниц
                await this.loadAllPages();
            } catch (error: unknown) {
                const requestError = toRequestError('PUT', `/api/bricks/${id}`, error);
                console.error('[Publish Store] Failed to update page:', error);
                throw requestError;
            }
        },

        /**
         * Частично обновляет страницу через PATCH /api/bricks/:id.
         *
         * @param id - Идентификатор страницы.
         * @param payload - Частичный payload обновления.
         */
        async patchPage(id: string | number, payload: IUpdatePagePayload): Promise<IPublishedPage> {
            const { apiFetcher } = useApiClient();

            try {
                const response = await apiFetcher<IPublishedPage>(`/api/bricks/${id}/`, {
                    method: 'PATCH',
                    body: toSnakeCaseShallow(payload),
                });

                const normalized = normalizePublishedPage(
                    response,
                    resolveDefaultBackgroundColor()
                );

                const index = this.publishedPages.findIndex(
                    (page) => String(page.id) === String(id)
                );
                if (index === -1) {
                    this.publishedPages = [normalized, ...this.publishedPages];
                } else {
                    this.publishedPages.splice(index, 1, normalized);
                }

                return normalized;
            } catch (error: unknown) {
                const requestError = toRequestError('PATCH', `/api/bricks/${id}`, error);
                console.error('[Publish Store] Failed to patch page:', error);
                throw requestError;
            }
        },

        /**
         * Удаляет страницу из БД.
         *
         * @param id - Идентификатор страницы.
         */
        async deletePage(id: string | number): Promise<void> {
            const { apiFetcher } = useApiClient();

            try {
                await apiFetcher(`/api/bricks/${id}/`, {
                    method: 'DELETE',
                });

                console.log('[Publish Store] Page deleted successfully');

                // Удаляем из локального состояния
                const index = this.publishedPages.findIndex(
                    (page) => String(page.id) === String(id)
                );
                if (index !== -1) {
                    this.publishedPages.splice(index, 1);
                }
            } catch (error: unknown) {
                const requestError = toRequestError('DELETE', `/api/bricks/${id}`, error);
                console.error('[Publish Store] Failed to delete page:', error);
                throw requestError;
            }
        },

        /**
         * Загружает список всех страниц.
         */
        async loadAllPages(): Promise<void> {
            const { apiFetcher } = useApiClient();

            try {
                const response = await apiFetcher<IPublishedPage[]>('/api/bricks/');
                this.publishedPages = response.map((page) =>
                    normalizePublishedPage(page, resolveDefaultBackgroundColor())
                );
            } catch (error: unknown) {
                const requestError = toRequestError('GET', '/api/bricks', error);
                this.generalError = requestError.message;
                console.error('[Publish Store] Failed to load pages:', error);
                throw requestError;
            }
        },

        /**
         * Загружает страницу по `pagename`.
         *
         * @param pagename - ЧПУ страницы.
         */
        async loadPageByPagename(pagename: string): Promise<IPublishedPage | null> {
            const { apiFetcher } = useApiClient();
            let errorUrl = `/api/bricks/published (lookup ${pagename})`;

            try {
                const publishedPages =
                    await apiFetcher<IPublishedPageSummary[]>('/api/bricks/published/');

                const publishedPage = publishedPages.find(
                    (candidate) => candidate.pagename === pagename && candidate.published
                );

                if (!publishedPage) {
                    this.generalError = `GET /api/bricks/published: page "${pagename}" is not published`;
                    return null;
                }

                errorUrl = `/api/bricks/${publishedPage.id}`;
                const page = await apiFetcher<IPublishedPage>(`/api/bricks/${publishedPage.id}/`);
                return normalizePublishedPage(page, resolveDefaultBackgroundColor());
            } catch (error: unknown) {
                const requestError = toRequestError('GET', errorUrl, error);
                this.generalError = requestError.message;
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
            this.validationErrors = {};
            this.generalError = '';

            const trimmedPagename = this.currentFormState.pagename.trim();
            if (trimmedPagename !== this.currentFormState.pagename) {
                this.currentFormState = {
                    ...this.currentFormState,
                    pagename: trimmedPagename,
                };
            }

            if (!trimmedPagename) {
                this.validationErrors.pagename = 'Необходимо указать pagename';
            } else if (!/^[a-z0-9-]+$/.test(trimmedPagename)) {
                this.validationErrors.pagename = 'Допустимы только строчные буквы, цифры и дефис';
            } else if (
                !this.isPagenameAvailable(
                    trimmedPagename,
                    this.editingPageId !== null ? this.editingPageId : undefined
                )
            ) {
                this.validationErrors.pagename = 'Такой pagename уже занят';
            }

            if (!this.currentFormState.title?.trim()) {
                this.validationErrors.title = 'Заголовок обязателен';
            }

            if (!this.currentFormState.description?.trim()) {
                this.validationErrors.description = 'Описание обязательно';
            }

            this.validateOptionalRoutingFields();

            if (Object.keys(this.validationErrors).length > 0) {
                this.generalError = 'Заполните обязательные поля *';
                return false;
            }

            return true;
        },

        /**
         * Валидирует опциональные поля маршрутизации (urlPrefix, subdomain).
         */
        validateOptionalRoutingFields(): void {
            const trimmedUrlPrefix = this.currentFormState.urlPrefix?.trim() || null;
            if (trimmedUrlPrefix !== this.currentFormState.urlPrefix) {
                this.currentFormState = { ...this.currentFormState, urlPrefix: trimmedUrlPrefix };
            }
            if (trimmedUrlPrefix && !/^[a-z0-9-]+(\/[a-z0-9-]+)*$/.test(trimmedUrlPrefix)) {
                this.validationErrors.urlPrefix = 'Допустимы строчные буквы, цифры, дефис и /';
            }

            const trimmedSubdomain = this.currentFormState.subdomain?.trim() || null;
            if (trimmedSubdomain !== this.currentFormState.subdomain) {
                this.currentFormState = { ...this.currentFormState, subdomain: trimmedSubdomain };
            }
            if (trimmedSubdomain && !/^[a-z0-9-]+$/.test(trimmedSubdomain)) {
                this.validationErrors.subdomain = 'Допустимы только строчные буквы, цифры и дефис';
            }
        },

        /**
         * Публикует или обновляет текущий лендинг.
         *
         * @param schema - Схема лендинга из канваса.
         * @returns ID страницы или null при ошибке.
         */
        async publishCurrentPage(schema: BricksSchema): Promise<string | number | null> {
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
                this.generalError =
                    (error as Error)?.message ||
                    'Не удалось опубликовать страницу. Попробуйте ещё раз.';
                return null;
            } finally {
                this.isSubmitting = false;
            }
        },

        /**
         * Генерирует свободный `pagename` для копии страницы.
         *
         * @param base - Исходный `pagename`.
         * @returns Уникальный `pagename` для копии.
         */
        generateCopyPagename(base: string): string {
            const safeBase = base?.trim() ? base.trim() : 'page';
            const normalizedBase = safeBase.replace(/-copy(?:-\d+)?$/, '');
            let candidate = `${normalizedBase}-copy`;
            let suffix = 1;

            while (!this.isPagenameAvailable(candidate)) {
                candidate = `${normalizedBase}-copy-${suffix}`;
                suffix += 1;
            }

            return candidate;
        },

        /**
         * Сохраняет текущую конфигурацию как копию страницы.
         *
         * @param schema - Схема лендинга из канваса.
         * @returns ID копии или null при ошибке.
         */
        async saveCurrentPageAsCopy(schema: BricksSchema): Promise<string | number | null> {
            const originalFormState = { ...this.currentFormState };
            const originalEditingPageId = this.editingPageId;
            const originalValidationErrors = { ...this.validationErrors };
            const originalGeneralError = this.generalError;

            const copyPagename = this.generateCopyPagename(originalFormState.pagename);
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
                return await this.publishPage(schema, this.currentFormState);
            } catch (error: unknown) {
                console.error('[Publish Store] saveCurrentPageAsCopy failed:', error);
                this.generalError =
                    (error as Error)?.message || 'Не удалось сохранить копию. Попробуйте ещё раз.';
                return null;
            } finally {
                this.isSubmitting = false;
                this.currentFormState = originalFormState;
                this.editingPageId = originalEditingPageId;
                this.validationErrors = { ...originalValidationErrors };
                this.generalError = originalGeneralError;
            }
        },

        /**
         * Создаёт превью текущего лендинга.
         *
         * @param schema - Схема лендинга.
         * @returns Открыта ли вкладка превью.
         */
        previewCurrentPage(schema: BricksSchema): boolean {
            try {
                // For preview, we only need a pagename (or generate a temp one)
                const pagename = this.currentFormState.pagename.trim() || `preview-${Date.now()}`;
                const tempPageId = `preview-${Date.now()}`;
                const previewData: IPreviewStoredPage = {
                    id: Number(tempPageId.replace('preview-', '')),
                    pagename,
                    title: this.currentFormState.title || 'Превью',
                    description: this.currentFormState.description || 'Превью',
                    keywords: this.currentFormState.keywords,
                    published: this.currentFormState.published,
                    layout: this.currentFormState.layout,
                    backgroundColor: this.currentFormState.backgroundColor,
                    socialImage: this.currentFormState.socialImage,
                    urlPrefix: this.currentFormState.urlPrefix,
                    subdomain: this.currentFormState.subdomain,
                    createdAt: this.currentFormState.createdAt,
                    updatedAt: this.currentFormState.updatedAt,
                    schema,
                    isPreview: true,
                    storedAt: new Date().toISOString(),
                };

                if (typeof window === 'undefined') {
                    console.warn('[Publish Store] previewCurrentPage: window is not available');
                    return false;
                }

                window.localStorage.setItem('bricks-preview-page', JSON.stringify(previewData));
                const previewUrl = `${this.generatePreviewUrl(pagename)}`;
                window.open(previewUrl, '_blank');
                return true;
            } catch (error) {
                console.error('[Publish Store] Failed to create preview:', error);
                this.generalError = 'Не удалось создать превью. Попробуйте ещё раз.';
                return false;
            }
        },

        /**
         * Генерирует URL для превью.
         *
         * @param pagename - ЧПУ страницы.
         */
        generatePreviewUrl(pagename: string): string {
            return `/bricks/${pagename}?preview=true`;
        },
    },
});
