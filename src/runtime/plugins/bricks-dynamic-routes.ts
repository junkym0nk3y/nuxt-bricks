// #region Imports
// Nuxt
import { defineNuxtPlugin, useRouter, useState } from '#imports';

// Types
import type { IPublishedPageSummary } from '../modules/common/types/bricks-api';
import type { Router } from 'vue-router';

// Composables
import { useApiClient } from '../modules/common/composables/useApiClient';

// Utils
import { toCamelCase } from '../modules/common/utils/case-transform';
// #endregion

const ROUTE_NAME_PREFIX = 'bricks-direct-';

/**
 * Экранирует имя страницы для безопасного использования в regex-маршруте.
 *
 * @param pagename Имя страницы.
 * @returns Экранированная строка для вставки в regex.
 */
function escapePagenameForRegex(pagename: string): string {
    return pagename.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Добавляет прямые маршруты вида /pagename, указывающие на /bricks/[pagename].
 *
 * @param router Экземпляр Vue Router.
 * @param pages Список опубликованных страниц из API.
 */
function registerPublishedRoutes(router: Router, pages: IPublishedPageSummary[]): void {
    const bricksComponent = () => import('../modules/render/pages/[pagename].vue');

    pages.forEach(({ pagename, urlPrefix }) => {
        const routeName = `${ROUTE_NAME_PREFIX}${pagename}`;

        if (router.hasRoute(routeName)) {
            return;
        }

        const safePagename = escapePagenameForRegex(pagename);
        const prefix = urlPrefix?.trim();

        const path = prefix
            ? `/${prefix}/:pagename(${safePagename})`
            : `/:pagename(${safePagename})`;

        router.addRoute({
            name: routeName,
            path,
            component: bricksComponent,
            meta: {
                isPublishedBricksPage: true,
            },
        });
    });
}

export default defineNuxtPlugin(async () => {
    const router = useRouter();
    const { apiFetcher } = useApiClient();

    const publishedPages = useState<IPublishedPageSummary[]>(
        'bricks-published-pages',
        () => []
    );

    if (publishedPages.value.length === 0) {
        try {
            const response =
                await apiFetcher<IPublishedPageSummary[]>('/api/bricks/published/');
            publishedPages.value = toCamelCase<IPublishedPageSummary[]>(response);
        } catch (error) {
            console.error('[Bricks Routes] Failed to load published pages list', error);
            return;
        }
    }

    registerPublishedRoutes(router, publishedPages.value);
});
