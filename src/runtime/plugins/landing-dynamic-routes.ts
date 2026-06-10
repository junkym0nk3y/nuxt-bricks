// #region Imports
// Nuxt
import { defineNuxtPlugin } from '#imports';

// Types
import type { IPublishedLandingPageSummary } from '../types/landing-api';
import type { Router } from 'vue-router';

// Composables
import { useApiClient } from '../composables/useApiClient';

// Utils
import { toCamelCase } from '../utils/case-transform';
// #endregion

const ROUTE_NAME_PREFIX = 'landing-direct-';

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
 * Добавляет прямые маршруты вида /pagename, указывающие на /landing/[pagename].
 *
 * @param router Экземпляр Vue Router.
 * @param pages Список опубликованных страниц из API.
 */
function registerPublishedRoutes(router: Router, pages: IPublishedLandingPageSummary[]): void {
    const landingComponent = () => import('../render/pages/[pagename].vue');

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
            component: landingComponent,
            meta: {
                isPublishedLanding: true,
            },
        });
    });
}

export default defineNuxtPlugin(async () => {
    const router = useRouter();
    const { apiFetcher } = useApiClient();

    const publishedPages = useState<IPublishedLandingPageSummary[]>(
        'landing-published-pages',
        () => []
    );

    if (publishedPages.value.length === 0) {
        try {
            const response =
                await apiFetcher<IPublishedLandingPageSummary[]>('/api/landing/published/');
            publishedPages.value = toCamelCase<IPublishedLandingPageSummary[]>(response);
        } catch (error) {
            console.error('[Landing Routes] Failed to load published pages list', error);
            return;
        }
    }

    registerPublishedRoutes(router, publishedPages.value);
});
