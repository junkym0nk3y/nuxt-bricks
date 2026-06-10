import { defineStore } from 'pinia';
import type { LandingSchema } from '../types/landing';
import type {
    IUpdateLandingPayload,
    IPublishedLandingPageSummary,
    IPublishedPage,
    TPublishFormState,
    TRequestErrorLike,
} from '../types/landing-api';
import type { IBuilderDraftEntry } from '../types/builder-drafts';
import { useApiClient } from '../composables/useApiClient';
import { toCamelCase, toSnakeCaseShallow } from '../utils/case-transform';

const DEFAULT_BACKGROUND_COLOR = '#FFFFFF';
const DEFAULT_LAYOUT = 'default';

/**
 * Проверяет, что значение похоже на LandingSchema.
 *
 * @param value - Проверяемое значение.
 */
function isLandingSchema(value: unknown): value is LandingSchema {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        return false;
    }

    const record = value as Record<string, unknown>;
    return Array.isArray(record.components);
}

/**
 * Кэш цвета фона из app config (устанавливается из Vue контекста).
 */
let cachedBackgroundColor: string | null = null;

/**
 * Устанавливает кэшированный цвет фона из app config.
 * Вызывать из Vue setup контекста (например, в useLandingBuilderPage).
 *
 * @param color - Цвет фона из конфига.
 */
export function setPublishStoreBackgroundColor(color: string): void {
    cachedBackgroundColor = color;
}

/**
 * Возвращает цвет фона из кэша или дефолт.
 *
 * @returns Цвет фона по умолчанию.
 */
function resolveDefaultBackgroundColor(): string {
    return cachedBackgroundColor || DEFAULT_BACKGROUND_COLOR;
}

/**
 * Собирает дефолтное состояние формы публикации с учётом конфигурации.
 *
 * @returns Дефолтное состояние формы публикации.
 */
function buildDefaultFormState(): TPublishFormState {
    const backgroundColor = resolveDefaultBackgroundColor();

    return {
        pagename: '',
        title: '',
        description: '',
        keywords: '',
        published: false,
        backgroundColor,
        layout: DEFAULT_LAYOUT,
        socialImage: '',
        urlPrefix: null,
        subdomain: null,
        createdAt: '',
        updatedAt: '',
    };
}

/**
 * Стабилизирует состояние формы публикации: заполняет отсутствующие поля дефолтами.
 *
 * @param formState - Произвольное состояние формы (например из localStorage).
 * @returns Полная структура TPublishFormState.
 */
function normalizeFormState(formState: Partial<TPublishFormState>): TPublishFormState {
    const defaults = buildDefaultFormState();

    return {
        ...defaults,
        ...formState,
        pagename: formState.pagename ?? defaults.pagename,
        title: formState.title ?? defaults.title,
        description: formState.description ?? defaults.description,
        keywords: formState.keywords ?? defaults.keywords,
        published: Boolean(formState.published),
        backgroundColor: formState.backgroundColor ?? defaults.backgroundColor,
        layout: formState.layout ?? defaults.layout,
        socialImage: formState.socialImage ?? defaults.socialImage,
        urlPrefix: formState.urlPrefix ?? null,
        subdomain: formState.subdomain ?? null,
        createdAt: formState.createdAt ?? defaults.createdAt,
        updatedAt: formState.updatedAt ?? defaults.updatedAt,
    };
}

/**
 * Формирует ключ localStorage для черновика билдера.
 *
 * @param pagename - ЧПУ страницы.
 * @returns Ключ для localStorage.
 */
function buildBuilderDraftKey(pagename: string): string {
    return `landing-builder:draft:${pagename}`;
}

/**
 * Нормализует схему: гарантирует наличие components, сохраняет meta если не пуста.
 *
 * @param schema - Схема лендинга.
 * @returns Нормализованная схема.
 */
function preserveSchema(schema: LandingSchema | null | undefined): LandingSchema {
    if (!schema) {
        return { components: [] };
    }

    const result: LandingSchema = {
        components: schema.components ?? [],
    };

    if (schema.meta && Object.keys(schema.meta).length > 0) {
        result.meta = schema.meta;
    }

    return result;
}

/**
 * Нормализует ответ API в форму IPublishedPage.
 * Конвертирует snake_case ключи из Django backend в camelCase, но не трогает `schema`.
 *
 * @param rawPage - Данные страницы из API (может быть в snake_case).
 * @returns Нормализованная опубликованная страница в camelCase.
 */
function normalizePublishedPage(rawPage: Partial<IPublishedPage>): IPublishedPage {
    // Конвертируем snake_case → camelCase, но schema оставляем как есть (это пользовательский JSON)
    const rawRecord = rawPage as Record<string, unknown>;
    const rawSchema = rawRecord.schema;
    const rest: Record<string, unknown> = { ...rawRecord };
    delete rest.schema;
    const page = toCamelCase<Partial<IPublishedPage>>(rest);

    const backgroundColor: string = page.backgroundColor ?? resolveDefaultBackgroundColor();
    const layout: string = page.layout ?? DEFAULT_LAYOUT;
    const createdAt = page.createdAt ?? '';
    const updatedAt = page.updatedAt ?? createdAt;
    const schema = isLandingSchema(rawSchema) ? rawSchema : { components: [] };

    return {
        id: page.id as number,
        pagename: page.pagename as string,
        title: page.title ?? '',
        description: page.description ?? '',
        keywords: page.keywords ?? '',
        backgroundColor,
        layout,
        socialImage: page.socialImage ?? '',
        urlPrefix: page.urlPrefix ?? null,
        subdomain: page.subdomain ?? null,
        schema: preserveSchema(schema),
        published: Boolean(page.published),
        createdAt,
        updatedAt,
    };
}

/**
 * Форматирует ошибку запроса в человекочитаемое сообщение.
 *
 * @param method - HTTP-метод.
 * @param url - URL запроса.
 * @param error - Исходная ошибка.
 */
function formatRequestError(method: string, url: string, error: unknown): string {
    const payload = (error ?? {}) as TRequestErrorLike;
    const message =
        payload.data?.message ||
        payload.message ||
        (error instanceof Error ? error.message : 'Неизвестная ошибка');
    const code = payload.data?.code || payload.code || payload.statusCode;
    const codePart = code ? ` (code: ${String(code)})` : '';

    return `${method} ${url}: ${message}${codePart}`;
}

/**
 * Приводит произвольную ошибку к Error с понятным текстом.
 *
 * @param method - HTTP-метод.
 * @param url - URL запроса.
 * @param error - Исходная ошибка.
 */
function toRequestError(method: string, url: string, error: unknown): Error {
    if (error instanceof Error && error.message.includes('/api/')) {
        return error;
    }

    return new Error(formatRequestError(method, url, error));
}

/**
 * Pinia-стор для публикации, черновиков и загрузки страниц лендинга.
 */
export const usePublishStore = defineStore('publish', {
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
         * Возвращает черновик билдера из localStorage.
         *
         * @param pagename - ЧПУ страницы.
         */
        getBuilderDraft(pagename: string): IBuilderDraftEntry | null {
            if (typeof window === 'undefined') {
                return null;
            }

            const key = buildBuilderDraftKey(pagename);
            const raw = window.localStorage.getItem(key);
            if (!raw) {
                return null;
            }

            try {
                return JSON.parse(raw) as IBuilderDraftEntry;
            } catch (error) {
                console.warn('[Publish Store] Failed to parse builder draft:', { key, error });
                return null;
            }
        },

        /**
         * Сохраняет черновик билдера в localStorage.
         *
         * @param draft - Данные черновика.
         */
        setBuilderDraft(draft: IBuilderDraftEntry): void {
            if (typeof window === 'undefined') {
                return;
            }

            const normalized: IBuilderDraftEntry = {
                ...draft,
                draftSnapshot: {
                    schema: draft.draftSnapshot.schema,
                    formState: normalizeFormState(draft.draftSnapshot.formState),
                },
                savedSnapshot: draft.savedSnapshot
                    ? {
                          schema: draft.savedSnapshot.schema,
                          formState: normalizeFormState(draft.savedSnapshot.formState),
                      }
                    : undefined,
            };

            const key = buildBuilderDraftKey(draft.pagename);
            try {
                window.localStorage.setItem(key, JSON.stringify(normalized));
            } catch (error) {
                console.warn('[Publish Store] Failed to save builder draft:', { key, error });
            }
        },

        /**
         * Удаляет черновик билдера.
         *
         * @param pagename - ЧПУ страницы.
         */
        removeBuilderDraft(pagename: string): void {
            if (typeof window === 'undefined') {
                return;
            }

            const key = buildBuilderDraftKey(pagename);
            window.localStorage.removeItem(key);
        },

        /**
         * Переносит черновик билдера на новый pagename.
         *
         * @param fromPagename - Старый pagename.
         * @param toPagename - Новый pagename.
         */
        migrateBuilderDraft(fromPagename: string, toPagename: string): void {
            if (typeof window === 'undefined') {
                return;
            }

            const fromKey = buildBuilderDraftKey(fromPagename);
            const toKey = buildBuilderDraftKey(toPagename);

            if (fromKey === toKey) {
                return;
            }

            const raw = window.localStorage.getItem(fromKey);
            if (!raw) {
                return;
            }

            try {
                const parsed = JSON.parse(raw) as IBuilderDraftEntry;
                parsed.pagename = toPagename;
                window.localStorage.setItem(toKey, JSON.stringify(parsed));
                window.localStorage.removeItem(fromKey);
            } catch (error) {
                console.warn('[Publish Store] Failed to migrate builder draft:', { error });
            }
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
         * Публикует новую страницу через API.
         *
         * @param schema - Схема лендинга.
         * @param formState - Данные формы публикации.
         */
        async publishPage(schema: LandingSchema, formState: TPublishFormState): Promise<number> {
            const { apiFetcher } = useApiClient();

            try {
                const response = await apiFetcher<{ id: number; pagename: string }>(
                    '/api/landing/',
                    {
                        method: 'POST',
                        body: {
                            pagename: formState.pagename,
                            title: formState.title,
                            description: formState.description,
                            keywords: formState.keywords,
                            social_image: formState.socialImage || null,
                            background_color: formState.backgroundColor || DEFAULT_BACKGROUND_COLOR,
                            layout: formState.layout || DEFAULT_LAYOUT,
                            url_prefix: formState.urlPrefix || null,
                            subdomain: formState.subdomain || null,
                            schema: preserveSchema(schema),
                            published: formState.published,
                        },
                    }
                );

                console.log('[Publish Store] Page published successfully:', response);

                // Перезагружаем список страниц
                await this.loadAllPages();

                return response.id;
            } catch (error: unknown) {
                const requestError = toRequestError('POST', '/api/landing', error);
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
            schema: LandingSchema,
            formState: TPublishFormState
        ): Promise<void> {
            const { apiFetcher } = useApiClient();

            try {
                await apiFetcher(`/api/landing/${id}/`, {
                    method: 'PUT',
                    body: {
                        pagename: formState.pagename,
                        title: formState.title,
                        description: formState.description,
                        keywords: formState.keywords,
                        social_image: formState.socialImage || null,
                        background_color: formState.backgroundColor || DEFAULT_BACKGROUND_COLOR,
                        layout: formState.layout || DEFAULT_LAYOUT,
                        url_prefix: formState.urlPrefix || null,
                        subdomain: formState.subdomain || null,
                        schema: preserveSchema(schema),
                        published: formState.published,
                    },
                });

                console.log('[Publish Store] Page updated successfully');

                // Перезагружаем список страниц
                await this.loadAllPages();
            } catch (error: unknown) {
                const requestError = toRequestError('PUT', `/api/landing/${id}`, error);
                console.error('[Publish Store] Failed to update page:', error);
                throw requestError;
            }
        },

        /**
         * Частично обновляет страницу через PATCH /api/landing/:id.
         *
         * @param id - Идентификатор страницы.
         * @param payload - Частичный payload обновления.
         */
        async patchPage(
            id: string | number,
            payload: IUpdateLandingPayload
        ): Promise<IPublishedPage> {
            const { apiFetcher } = useApiClient();

            try {
                const response = await apiFetcher<IPublishedPage>(`/api/landing/${id}/`, {
                    method: 'PATCH',
                    body: toSnakeCaseShallow(payload),
                });

                const normalized = normalizePublishedPage(response);

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
                const requestError = toRequestError('PATCH', `/api/landing/${id}`, error);
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
                await apiFetcher(`/api/landing/${id}/`, {
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
                const requestError = toRequestError('DELETE', `/api/landing/${id}`, error);
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
                const response = await apiFetcher<IPublishedPage[]>('/api/landing/');
                this.publishedPages = response.map((page) => normalizePublishedPage(page));
            } catch (error: unknown) {
                const requestError = toRequestError('GET', '/api/landing', error);
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
            let errorUrl = `/api/landing/published (lookup ${pagename})`;

            try {
                const publishedPages =
                    await apiFetcher<IPublishedLandingPageSummary[]>('/api/landing/published/');

                const publishedPage = publishedPages.find(
                    (candidate) => candidate.pagename === pagename && candidate.published
                );

                if (!publishedPage) {
                    this.generalError = `GET /api/landing/published: page "${pagename}" is not published`;
                    return null;
                }

                errorUrl = `/api/landing/${publishedPage.id}`;
                const page = await apiFetcher<IPublishedPage>(`/api/landing/${publishedPage.id}/`);
                return normalizePublishedPage(page);
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
        async publishCurrentLanding(schema: LandingSchema): Promise<string | number | null> {
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
                console.error('[Publish Store] publishCurrentLanding failed:', error);
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
            const safeBase = base?.trim() ? base.trim() : 'landing';
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
        async saveCurrentLandingAsCopy(schema: LandingSchema): Promise<string | number | null> {
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
                console.error('[Publish Store] saveCurrentLandingAsCopy failed:', error);
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
        previewCurrentLanding(schema: LandingSchema): boolean {
            try {
                // For preview, we only need a pagename (or generate a temp one)
                const pagename = this.currentFormState.pagename.trim() || `preview-${Date.now()}`;
                const tempPageId = `preview-${Date.now()}`;
                const previewData: IPublishedPage = {
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
                };

                if (typeof window === 'undefined') {
                    console.warn('[Publish Store] previewCurrentLanding: window is not available');
                    return false;
                }

                window.localStorage.setItem('landing-preview-page', JSON.stringify(previewData));
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
            return `/landing/${pagename}?preview=true`;
        },
    },
});
