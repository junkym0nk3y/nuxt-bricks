import type { LayoutKey } from '#build/types/layouts';
import { defineNuxtRouteMiddleware, useNuxtApp, setPageLayout } from '#app';
import { createError, useState, useRequestHeaders } from '#imports';
import type { LandingSchema } from '../modules/common/types/landing';
import type { IPublishedLandingPageSummary, IPublishedPage } from '../modules/common/types/landing-api';
import { normalizeLandingError } from '../modules/common/utils/main';
import { useApiClient } from '../modules/common/composables/useApiClient';
import { toCamelCase } from '../modules/common/utils/case-transform';

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
    const schema = isLandingSchema(rawSchema) ? rawSchema : { components: [] };

    const createdAt = page.createdAt ?? '';
    const updatedAt = page.updatedAt ?? createdAt;

    return {
        id: page.id as number,
        pagename: page.pagename as string,
        title: page.title ?? '',
        description: page.description ?? '',
        keywords: page.keywords ?? '',
        backgroundColor: page.backgroundColor ?? DEFAULT_BACKGROUND_COLOR,
        layout: page.layout ?? DEFAULT_LAYOUT,
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
 * - /landing/[pagename] (встроенный маршрут)
 * - /[pagename] (динамически зарегистрированные ЧПУ маршруты)
 */
// eslint-disable-next-line complexity
export default defineNuxtRouteMiddleware(async (to) => {
    // Применяем middleware к встроенному маршруту или динамическим ЧПУ маршрутам
    const isLandingRoute = to.name === 'landing-pagename';
    const isDirectLandingRoute = to.meta?.isPublishedLanding === true;

    if (!isLandingRoute && !isDirectLandingRoute) {
        return;
    }

    const nuxtApp = useNuxtApp();
    const pagename = to.params.pagename as string;
    const isPreview = to.query.preview === 'true';
    const { apiFetcher } = useApiClient();

    const pageDataKey = `landing-page-${pagename}-${isPreview ? 'preview' : 'live'}`;

    // Пытаемся получить данные из payload, если они уже были загружены этим middleware
    // Это обрабатывает клиентскую навигацию, когда middleware может запуститься повторно
    let page: IPublishedPage | null = nuxtApp.payload.data[pageDataKey] as IPublishedPage | null;

    if (!page) {
        if (isPreview && import.meta.client) {
            const previewData = window.localStorage.getItem('landing-preview-page');

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
            const apiEndpoint = isPreview ? '/api/landing/' : '/api/landing/published/';
            const stateKey = isPreview ? 'landing-all-pages' : 'landing-published-pages';

            const pagesList = useState<IPublishedLandingPageSummary[]>(stateKey, () => []);

            if (!pagesList.value.length) {
                try {
                    const response = await apiFetcher<IPublishedLandingPageSummary[]>(apiEndpoint);
                    pagesList.value = toCamelCase<IPublishedLandingPageSummary[]>(response);
                } catch (error) {
                    return createError(normalizeLandingError(error, 'Failed to load pages list'));
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
                        statusMessage: 'Landing page not found',
                    });
                }
            }

            if (!targetPage) {
                // При preview драфт может жить только в localStorage (недоступен на сервере).
                // Не кидаем 404 — страница сама подхватит данные из localStorage на клиенте.
                if (isPreview) {
                    return;
                }

                console.warn('[Landing Middleware] Page not found:', {
                    pagename,
                    availablePages: pagesList.value.map((p) => p.pagename),
                });
                return createError({
                    statusCode: 404,
                    statusMessage: 'Landing page not found',
                });
            }

            try {
                const response = await apiFetcher<IPublishedPage>(`/api/landing/${targetPage.id}/`);
                page = normalizePublishedPage(response);
            } catch (error) {
                return createError(normalizeLandingError(error, 'Failed to load landing page'));
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
            console.warn('[Landing Middleware] Failed to apply layout:', layout, error);
        }
    } else if (!isPreview && !page) {
        // Этот случай в идеале должен обрабатываться createError выше, но на всякий случай
        return createError({
            statusCode: 404,
            statusMessage: 'Landing page not found',
        });
    }
});
