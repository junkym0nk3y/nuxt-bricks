import type { LayoutKey } from 'nuxt/app';
import { defineNuxtRouteMiddleware, useNuxtApp, setPageLayout } from '#app';
import { createError, useState, useRequestHeaders } from '#imports';
import type { IPublishedPageSummary, IPublishedPage } from '../modules/common/types/bricks-api';
import { normalizeBricksError } from '../modules/common/utils/main';
import { useApiClient } from '../modules/common/composables/useApiClient';
import { toCamelCase } from '../modules/common/utils/case-transform';
import { normalizePublishedPage } from '../modules/common/utils/bricks/publishedPage';

/**
 * Middleware для динамической установки layout на основе данных из БД.
 * Применяется к страницам лендингов:
 * - /preview/[pagename] (встроенный превью-маршрут, всегда preview-режим)
 * - /[pagename] (динамически зарегистрированные ЧПУ маршруты, live-режим)
 *
 * Режим определяется чисто по роуту: query ?preview=true не используется.
 */
// eslint-disable-next-line complexity
export default defineNuxtRouteMiddleware(async (to) => {
    // Применяем middleware к превью-маршруту или динамическим ЧПУ маршрутам
    const isPreview = to.name === 'bricks-preview';
    const isDirectBricksRoute = to.meta?.isPublishedBricksPage === true;

    if (!isPreview && !isDirectBricksRoute) {
        return;
    }

    const nuxtApp = useNuxtApp();
    const pagename = to.params.pagename as string;
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
        (nuxtApp.payload.data as Record<string, unknown>)[pageDataKey] = page;
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
