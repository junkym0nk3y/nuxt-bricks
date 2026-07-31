import type { LayoutKey } from 'nuxt/app';
import { defineNuxtRouteMiddleware, useNuxtApp, setPageLayout } from '#app';
import { createError, useState, useRequestHeaders, useRuntimeConfig } from '#imports';
import type { TPublishedPageSummary, IPublishedPage } from '../modules/common/types/bricks-api';
import { normalizeBricksError, parseBricksBooleanFlag } from '../modules/common/utils/main';
import { isRequestTimeoutError } from '../modules/common/utils/apiRequestPolicy';
import { useApiClient } from '../modules/common/composables/useApiClient';
import { usePublicPageClient } from '../modules/render/composables/usePublicPageClient';
import { withPageLookupDeadline } from '../modules/render/utils/pageLookupDeadline';
import { toCamelCase } from '../modules/common/utils/case-transform';
import { BRICKS_ROUTE_NAMES } from '../modules/common/constants/routes';
import {
    matchesPageSubdomain,
    matchesPageUrlPrefix,
    normalizePublishedPage,
    resolveRequestedUrlPrefix,
} from '../modules/common/utils/bricks/publishedPage';

/**
 * Статус неотвечающего backend'а. Таймаут lookup'а — не «страницы нет»: 404 на
 * него закешировался бы у CDN и был бы понят краулером как отсутствие страницы.
 */
const HTTP_GATEWAY_TIMEOUT = 504;

/**
 * Ограничивает SSR-lookup страницы по времени (детали политики — в утилите).
 *
 * @param operation - Промис lookup'а.
 * @returns Промис lookup'а с дедлайном на SSR.
 */
function withLookupDeadline<T>(operation: Promise<T>): Promise<T> {
    return withPageLookupDeadline(operation, Boolean(import.meta.server));
}

/**
 * Возвращает статус, под которым отказ lookup'а уходит пользователю.
 *
 * @param error - Ошибка lookup'а.
 * @param fallbackStatus - Статус для обычного отказа.
 * @returns HTTP-статус.
 */
function resolveLookupErrorStatus(error: unknown, fallbackStatus: number): number {
    return isRequestTimeoutError(error) ? HTTP_GATEWAY_TIMEOUT : fallbackStatus;
}

/**
 * Middleware для динамической установки layout на основе данных из БД.
 * Применяется к страницам лендингов:
 * - /preview/[pagename] (встроенный превью-маршрут, всегда preview-режим)
 * - /[pagename] и /[...urlPrefix]/[pagename] (статические catch-all маршруты
 *   bricks-page/bricks-page-prefixed из module.ts, live-режим)
 *
 * Режим определяется чисто по роуту: query ?preview=true не используется.
 * Live-страница резолвится прямым lookup public read-model по pagename;
 * соответствие urlPrefix/subdomain фактическому URL проверяется здесь же.
 */
// eslint-disable-next-line complexity
export default defineNuxtRouteMiddleware(async (to) => {
    // Применяем middleware к превью-маршруту или динамическим ЧПУ маршрутам
    const isPreview = to.name === BRICKS_ROUTE_NAMES.preview;
    const isDirectBricksRoute = to.meta?.isPublishedBricksPage === true;

    if (!isPreview && !isDirectBricksRoute) {
        return;
    }

    const nuxtApp = useNuxtApp();
    const pagename = to.params.pagename as string;

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
        if (!page && isPreview) {
            // Preview — авторизованный сценарий (матрица auth защищает /preview/**):
            // ищем среди всех страниц, включая drafts, через editorial API
            // (админский клиент: cookie сессии билдера, 401-редирект на login)
            const { apiFetcher } = useApiClient();
            const pagesList = useState<TPublishedPageSummary[]>('bricks-all-pages', () => []);

            if (!pagesList.value.length) {
                try {
                    const response = await withLookupDeadline(
                        apiFetcher<TPublishedPageSummary[]>('/api/bricks/')
                    );
                    pagesList.value = toCamelCase<TPublishedPageSummary[]>(response);
                } catch (error) {
                    return createError(
                        normalizeBricksError(
                            error,
                            'Failed to load pages list',
                            resolveLookupErrorStatus(error, 500)
                        )
                    );
                }
            }

            const targetPage = pagesList.value.find((candidate) => candidate.pagename === pagename);

            // Драфт может жить только в localStorage (недоступен на сервере).
            // Не кидаем 404 — страница сама подхватит данные из localStorage на клиенте.
            if (!targetPage) {
                return;
            }

            try {
                const response = await withLookupDeadline(
                    apiFetcher<IPublishedPage>(`/api/bricks/${targetPage.id}/`)
                );
                page = normalizePublishedPage(response);
            } catch (error) {
                return createError(
                    normalizeBricksError(
                        error,
                        'Failed to load page',
                        resolveLookupErrorStatus(error, 500)
                    )
                );
            }
        }

        if (!page && !isPreview) {
            // Live — публичный read-model: прямой lookup по pagename, без list+find.
            // Публичный клиент: без cookie/CSRF/401-редиректа — ошибка lookup'а не
            // отправит посетителя на login билдера. Его собственный таймаут на SSR
            // инертен, потолок держит внешний дедлайн (`withLookupDeadline`)
            const { publicPageFetcher } = usePublicPageClient();

            try {
                const response = await withLookupDeadline(
                    publicPageFetcher<IPublishedPage>(`/api/bricks/public/pages/${pagename}/`)
                );
                page = normalizePublishedPage(response);
            } catch (error) {
                return createError(
                    normalizeBricksError(
                        error,
                        'Page not found',
                        resolveLookupErrorStatus(error, 404)
                    )
                );
            }
        }
        // Сохраняем данные в payload, чтобы избежать повторной загрузки в компоненте страницы
        (nuxtApp.payload.data as Record<string, unknown>)[pageDataKey] = page;
    }

    // Live: catch-all маршрут матчит любой URL подходящей формы — соответствие
    // фактического префикса и субдомена проверяем на каждую навигацию, в том
    // числе при payload-хите (прошлый заход мог быть по другому URL той же страницы)
    if (page && !isPreview) {
        const requestedPrefix = resolveRequestedUrlPrefix(to.params.urlPrefix);

        if (!matchesPageUrlPrefix(page, requestedPrefix)) {
            return createError({
                statusCode: 404,
                statusMessage: 'Page not found',
            });
        }

        if (page.subdomain) {
            let currentHost = '';

            if (import.meta.server) {
                // За доверенным прокси Host — адрес прокси; оригинальный хост —
                // последний непустой токен x-forwarded-host (дописан ближайшим
                // прокси-хопом, паттерн requestClientIp.ts; опт-ин bricks.trustProxy)
                const headers = useRequestHeaders(['host', 'x-forwarded-host']);
                const trustProxy = parseBricksBooleanFlag(useRuntimeConfig().bricksTrustProxy);
                const forwardedHost = trustProxy
                    ? headers['x-forwarded-host']
                          ?.split(',')
                          .map((entry) => entry.trim())
                          .filter(Boolean)
                          .at(-1)
                    : undefined;
                currentHost = forwardedHost || headers.host || '';
            } else {
                currentHost = window.location.hostname;
            }

            if (!matchesPageSubdomain(currentHost, page.subdomain)) {
                return createError({
                    statusCode: 404,
                    statusMessage: 'Page not found',
                });
            }
        }
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
