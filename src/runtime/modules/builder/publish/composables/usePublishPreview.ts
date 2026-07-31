import type { Composer } from 'vue-i18n';
import { useNuxtApp } from '#imports';
import type { IBricksSchema } from '../../../common/types/brick';
import type {
    IPageVersion,
    IPreviewStoredPage,
    TPublishedPageSummary,
} from '../../../common/types/bricks-api';
import type { IUsePublishPreviewReturn } from '../types/composables';
import { useBricksRoutePaths } from '../../../common/composables/useBricksRoutePaths';
import { usePublishStore } from '../stores/publish';

/**
 * Переводит ключ через глобальный i18n (композабл вызывается и вне setup-контекста).
 * `$i18n` резолвится лениво на каждый вызов — безопасно при любом порядке плагинов.
 */
function t(key: string): string {
    const i18n = useNuxtApp().$i18n as Composer | undefined;
    return i18n ? i18n.t(key) : key;
}

/**
 * Превью текущего лендинга: кладёт снапшот страницы в localStorage
 * (`bricks-preview-page`) и открывает превью-роут в новой вкладке.
 * Ошибки пишет в `generalError` publish-стора.
 */
export function usePublishPreview(): IUsePublishPreviewReturn {
    const publishStore = usePublishStore();
    const { previewPagePath, withBase } = useBricksRoutePaths();

    /**
     * Генерирует URL для превью — встроенный превью-маршрут
     * `<previewPrefix>/[pagename]`; с `app.baseURL` (открывается window.open).
     *
     * @param pagename - ЧПУ страницы.
     */
    function generatePreviewUrl(pagename: string): string {
        return withBase(previewPagePath(pagename));
    }

    /**
     * Создаёт превью текущего лендинга из состояния формы publish-стора.
     *
     * @param schema - Схема лендинга.
     * @returns `pagename` открытого превью или null при ошибке.
     */
    function previewCurrentPage(schema: IBricksSchema): string | null {
        try {
            const formState = publishStore.currentFormState;
            // Для превью достаточно pagename (или временного)
            const pagename = formState.pagename.trim() || `preview-${Date.now()}`;
            const tempPageId = `preview-${Date.now()}`;
            const previewData: IPreviewStoredPage = {
                id: Number(tempPageId.replace('preview-', '')),
                pagename,
                title: formState.title || t('bricks.publish.previewFallback'),
                description: formState.description || t('bricks.publish.previewFallback'),
                keywords: formState.keywords,
                published: formState.published,
                layout: formState.layout,
                backgroundColor: formState.backgroundColor,
                socialImage: formState.socialImage,
                urlPrefix: formState.urlPrefix,
                subdomain: formState.subdomain,
                thumbnailUrl: null,
                createdAt: formState.createdAt,
                updatedAt: formState.updatedAt,
                schema,
                isPreview: true,
                storedAt: new Date().toISOString(),
            };

            if (typeof window === 'undefined') {
                console.warn('[Publish Preview] previewCurrentPage: window is not available');
                return null;
            }

            window.localStorage.setItem('bricks-preview-page', JSON.stringify(previewData));
            window.open(generatePreviewUrl(pagename), '_blank');
            return pagename;
        } catch (error) {
            console.error('[Publish Preview] Failed to create preview:', error);
            publishStore.generalError = t('bricks.publish.previewCreateFailed');
            return null;
        }
    }

    /**
     * Превью сохранённой версии страницы: снапшот версии кладётся в localStorage
     * (`bricks-preview-page`) и открывается общий превью-роут.
     *
     * `pagename` берётся из ТЕКУЩЕЙ страницы, не из версии — он должен совпасть
     * с параметром роута `/preview/<pagename>` (страница могла быть переименована).
     *
     * Известное ограничение v1: если билдер с этой же страницей открыт в соседней
     * вкладке, его `BroadcastChannel('bricks-preview-sync')` ответит превью-вкладке
     * живой схемой канваса и перекроет схему версии.
     *
     * @param page - Текущая страница (источник pagename).
     * @param version - Полный снапшот версии.
     * @returns `pagename` открытого превью или null при ошибке.
     */
    function previewPageVersion(page: TPublishedPageSummary, version: IPageVersion): string | null {
        try {
            const previewData: IPreviewStoredPage = {
                id: page.id,
                pagename: page.pagename,
                title: version.title || t('bricks.publish.previewFallback'),
                description: version.description || t('bricks.publish.previewFallback'),
                keywords: version.keywords,
                published: version.published,
                layout: version.layout,
                backgroundColor: version.backgroundColor,
                socialImage: version.socialImage,
                urlPrefix: version.urlPrefix,
                subdomain: version.subdomain,
                thumbnailUrl: null,
                createdAt: page.createdAt,
                updatedAt: page.updatedAt,
                schema: version.schema,
                isPreview: true,
                storedAt: new Date().toISOString(),
            };

            if (typeof window === 'undefined') {
                console.warn('[Publish Preview] previewPageVersion: window is not available');
                return null;
            }

            window.localStorage.setItem('bricks-preview-page', JSON.stringify(previewData));
            window.open(generatePreviewUrl(page.pagename), '_blank');
            return page.pagename;
        } catch (error) {
            console.error('[Publish Preview] Failed to create version preview:', error);
            publishStore.generalError = t('bricks.publish.previewCreateFailed');
            return null;
        }
    }

    return { previewCurrentPage, previewPageVersion, generatePreviewUrl };
}
