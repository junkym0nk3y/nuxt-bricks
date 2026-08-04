import type { Composer } from 'vue-i18n';
import { useNuxtApp } from '#imports';
import type { IBricksSchema } from '../../../common/types/brick';
import type { IPreviewStoredPage } from '../../../common/types/bricks-api';
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
     * @param versionId - Id сохранённой версии (без него — текущее состояние).
     */
    function generatePreviewUrl(pagename: string, versionId?: number): string {
        return withBase(previewPagePath(pagename, versionId));
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
     * Превью сохранённой версии страницы: открывает превью-роут с `?version=`.
     * Снапшот приезжает с сервера (middleware превью тянет версию по id), поэтому
     * localStorage тут не участвует вовсе — слот там один, и открытый рядом
     * билдер той же страницы либо второе превью перетирали бы снимок версии.
     *
     * `pagename` берётся из ТЕКУЩЕЙ страницы, не из версии — он должен совпасть
     * с параметром роута `<previewPrefix>/<pagename>` (страница могла быть
     * переименована).
     *
     * @param pagename - ЧПУ текущей страницы.
     * @param versionId - Id сохранённой версии.
     * @returns `pagename` открытого превью или null, если вкладка не открылась.
     */
    function previewPageVersion(pagename: string, versionId: number): string | null {
        if (typeof window === 'undefined') {
            console.warn('[Publish Preview] previewPageVersion: window is not available');
            return null;
        }

        // Блокировщик попапов возвращает null — без проверки отказ был бы тихим
        return window.open(generatePreviewUrl(pagename, versionId), '_blank') ? pagename : null;
    }

    return { previewCurrentPage, previewPageVersion, generatePreviewUrl };
}
