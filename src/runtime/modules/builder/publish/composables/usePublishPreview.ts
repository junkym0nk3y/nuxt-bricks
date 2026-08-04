import type { Composer } from 'vue-i18n';
import { useNuxtApp } from '#imports';
import type { IBricksSchema } from '../../../common/types/brick';
import type { IPreviewStoredPage } from '../../../common/types/bricks-api';
import type { IBricksPageAddress } from '../../../common/types/pageAddress';
import type { IUsePublishPreviewReturn } from '../types/composables';
import { useBricksRoutePaths } from '../../../common/composables/useBricksRoutePaths';
import { isValidPageAddress, toPageAddress } from '../../../common/utils/bricks/pageAddress';
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
     * `<previewPrefix>/<адрес>`; с `app.baseURL` (открывается window.open).
     *
     * @param address - Адрес страницы.
     * @param versionId - Id сохранённой версии (без него — текущее состояние).
     */
    function generatePreviewUrl(address: IBricksPageAddress, versionId?: number): string {
        return withBase(previewPagePath(address, versionId));
    }

    /**
     * Создаёт превью текущего лендинга из состояния формы publish-стора.
     *
     * @param schema - Схема лендинга.
     * @returns Адрес открытого превью или null при ошибке.
     */
    function previewCurrentPage(schema: IBricksSchema): IBricksPageAddress | null {
        try {
            const formState = publishStore.currentFormState;
            // Адрес формы годится для URL превью только целиком и только валидный:
            // превью открывают и из невалидной формы, а невалидный сегмент не
            // сматчит regex адресного маршрута — вкладка показала бы 404. Тогда
            // берём временный bare-адрес: превью текущего канваса нужнее, чем
            // точный URL, а слот localStorage подхватится по этому же адресу
            const formAddress = toPageAddress(formState.pagename, formState.urlPrefix);
            const address = isValidPageAddress(formAddress)
                ? formAddress
                : { pagename: `preview-${Date.now()}`, urlPrefix: null };
            const tempPageId = `preview-${Date.now()}`;
            // В снапшот уезжает адрес URL превью, а не сырые поля формы: по нему
            // вкладка превью и middleware опознают снимок своим
            const previewData: IPreviewStoredPage = {
                id: Number(tempPageId.replace('preview-', '')),
                pagename: address.pagename,
                title: formState.title || t('bricks.publish.previewFallback'),
                description: formState.description || t('bricks.publish.previewFallback'),
                keywords: formState.keywords,
                published: formState.published,
                layout: formState.layout,
                backgroundColor: formState.backgroundColor,
                socialImage: formState.socialImage,
                urlPrefix: address.urlPrefix,
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
            window.open(generatePreviewUrl(address), '_blank');
            return address;
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
     * Адрес берётся у ТЕКУЩЕЙ страницы, не у версии — он должен совпасть с
     * параметрами роута `<previewPrefix>/<адрес>` (страницу могли переименовать
     * или перенести под другой префикс).
     *
     * @param address - Адрес текущей страницы.
     * @param versionId - Id сохранённой версии.
     * @returns Адрес открытого превью или null, если вкладка не открылась.
     */
    function previewPageVersion(
        address: IBricksPageAddress,
        versionId: number
    ): IBricksPageAddress | null {
        if (typeof window === 'undefined') {
            console.warn('[Publish Preview] previewPageVersion: window is not available');
            return null;
        }

        // Блокировщик попапов возвращает null — без проверки отказ был бы тихим
        return window.open(generatePreviewUrl(address, versionId), '_blank') ? address : null;
    }

    return { previewCurrentPage, previewPageVersion, generatePreviewUrl };
}
