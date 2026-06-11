import type { LayoutKey } from '#build/types/layouts';
import { defineNuxtRouteMiddleware, useNuxtApp, setPageLayout } from '#app';
import { createError, useState, useRequestHeaders } from '#imports';
import type { BricksSchema } from '../modules/common/types/brick';
import type { IPublishedPageSummary, IPublishedPage } from '../modules/common/types/bricks-api';
import { normalizeBricksError } from '../modules/common/utils/main';
import { useApiClient } from '../modules/common/composables/useApiClient';
import { toCamelCase } from '../modules/common/utils/case-transform';

const DEFAULT_BACKGROUND_COLOR = '#FFFFFF';
const DEFAULT_LAYOUT = 'default';

/**
 * Проверяет, что значение похоже на BricksSchema.
 *
 * @param value - Проверяемое значение.
 */
function isBricksSchema(value: unknown): value is BricksSchema {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        return false;
    }

    const record = value as Record<string, unknown>;
    return Array.isArray(record.components);
}

/**
 * Нормализует схему: гарантирует наличие components, сохраняет meta если не пуста.
 *
 * @param schema - Схема лендинга.
 * @returns Нормализованная схема.
 */
function preserveSchema(schema: BricksSchema | null | undefined): BricksSchema {
    if (!schema) {
        return { components: [] };
    }

    const result: BricksSchema = {
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
 * @returns Нормализованная опубликованная страница.
 */
function normalizePublishedPage(rawPage: unknown): IPublishedPage {
    const rawRecord: Record<string, unknown> =
        typeof rawPage === 'object' && rawPage !== null && !Array.isArray(rawPage)
            ? (rawPage as Record<string, unknown>)
            : {};

    const rawSchema = rawRecord.schema;
    const rest: Record<string, unknown> = { ...rawRecord };
    delete rest.schema;

    const page = toCamelCase<Partial<IPublishedPage>>(rest);
    const schema = isBricksSchema(rawSchema) ? rawSchema : { components: [] };

    const createdAt = page.createdAt ?? '';
    const updatedAt = page.updatedAt ?? createdAt;

    return {
        id: page.id as number,
        pagename: page.pagename as string,
        title: page.title ?? '',
        description: page.description ?? '',
        keywords: page.keywords ?? '',
        backgroundColor: page.backgroundColor ?? DEFAULT_BACKGROUND_COLOR,
        // Страницы, опубликованные до ребрендинга, могут хранить layout 'landing'
        layout: page.layout === 'landing' ? 'bricks' : (page.layout ?? DEFAULT_LAYOUT),
        socialImage: page.socialImage ?? '',
        urlPrefix: page.urlPrefix ?? null,
        subdomain: page.subdomain ?? null,
        schema: preserveSchema(schema),
        published: Boolean(page.published),
        createdAt,
        updatedAt,
        isPreview: page.isPreview,
    };
}

/**
 * Middleware для динамической установки layout на основе данных из БД.
 * Применяется к страницам лендингов:
 * - /bricks/[pagename] (встроенный маршрут)
 * - /[pagename] (динамически зарегистрированные ЧПУ маршруты)
 */
// eslint-disable-next-line complexity
export default defineNuxtRouteMiddleware(async (to) => {
    // Применяем middleware к встроенному маршруту или динамическим ЧПУ маршрутам
    const isBricksRoute = to.name === 'bricks-pagename';
    const isDirectBricksRoute = to.meta?.isPublishedBricksPage === true;

    if (!isBricksRoute && !isDirectBricksRoute) {
        return;
    }

    const nuxtApp = useNuxtApp();
    const pagename = to.params.pagename as string;
    const isPreview = to.query.preview === 'true';
    const { apiFetcher } = useApiClient();

    const pageDataKey = `bricks-page-${pagename}-${isPreview ? 'preview' : 'live'}`;

    // Пытаемся получить данные из payload, если они уже были загружены этим middleware
    // Это обрабатывает клиентскую навигацию, когда middleware может запуститься повторно
    let page: IPublishedPage | null = nuxtApp.payload.data[pageDataKey] as IPublishedPage | null;

    if (!page) {
        if (isPreview && import.meta.client) {
            const previewData = window.localStorage.getItem('bricks-preview-page');

            if (previewData) {
                const tempPage = JSON.parse(previewData) as IPublishedPage;

                if (tempPage.pagename === pagename) {
                    page = tempPage;
                }
            }
        }

        // Если данные не были получены из localStorage (или это не превью), загружаем из API
        if (!page) {
            // Для preview ищем среди всех страниц, для обычного режима — только среди опубликованных
            const apiEndpoint = isPreview ? '/api/bricks/' : '/api/bricks/published/';
            const stateKey = isPreview ? 'bricks-all-pages' : 'bricks-published-pages';

            const pagesList = useState<IPublishedPageSummary[]>(stateKey, () => []);

            if (!pagesList.value.length) {
                try {
                    const response = await apiFetcher<IPublishedPageSummary[]>(apiEndpoint);
                    pagesList.value = toCamelCase<IPublishedPageSummary[]>(response);
                } catch (error) {
                    return createError(normalizeBricksError(error, 'Failed to load pages list'));
                }
            }

            const targetPage = pagesList.value.find((candidate) => candidate.pagename === pagename);

            if (!isPreview && targetPage?.subdomain) {
                const currentHost = import.meta.server
                    ? useRequestHeaders(['host']).host || ''
                    : window.location.hostname;
                if (!currentHost.includes(targetPage.subdomain)) {
                    return createError({
                        statusCode: 404,
                        statusMessage: 'Page not found',
                    });
                }
            }

            if (!targetPage) {
                // При preview драфт может жить только в localStorage (недоступен на сервере).
                // Не кидаем 404 — страница сама подхватит данные из localStorage на клиенте.
                if (isPreview) {
                    return;
                }

                console.warn('[Bricks Middleware] Page not found:', {
                    pagename,
                    availablePages: pagesList.value.map((p) => p.pagename),
                });
                return createError({
                    statusCode: 404,
                    statusMessage: 'Page not found',
                });
            }

            try {
                const response = await apiFetcher<IPublishedPage>(`/api/bricks/${targetPage.id}/`);
                page = normalizePublishedPage(response);
            } catch (error) {
                return createError(normalizeBricksError(error, 'Failed to load page'));
            }
        }
        // Сохраняем данные в payload, чтобы избежать повторной загрузки в компоненте страницы
        (nuxtApp.payload.data as Record<string, any>)[pageDataKey] = page;
    }

    if (page) {
        const layout = page.layout || 'default';
        try {
            setPageLayout(layout as LayoutKey);
        } catch (error) {
            console.warn('[Bricks Middleware] Failed to apply layout:', layout, error);
        }
    } else if (!isPreview && !page) {
        // Этот случай в идеале должен обрабатываться createError выше, но на всякий случай
        return createError({
            statusCode: 404,
            statusMessage: 'Page not found',
        });
    }
});
