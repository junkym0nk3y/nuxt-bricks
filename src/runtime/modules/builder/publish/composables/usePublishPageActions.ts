// #region Imports
// Types
import type { TPublishedPageSummary } from '../../../common/types/bricks-api';
import type { TMediaLightboxItem } from '../../media/types/media';
import type {
    IUsePublishPageActionsOptions,
    IUsePublishPageActionsReturn,
} from '../types/composables';

// Utils
import { toPageAddress } from '../../../common/utils/bricks/pageAddress';

// Vue
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';

// Pinia
import { usePublishStore } from '../stores/publish';

// Composables
import { usePublishPreview } from './usePublishPreview';
// #endregion

/**
 * Действия над страницей, не требующие подтверждения: публикация, копия,
 * превью страницы и превью её миниатюры.
 *
 * Вынесены из хоста дашборда не «для порядка»: хост уже перерос потолок в 500
 * строк, а эти четыре действия связаны между собой только тем, что все относятся
 * к строке списка, — то есть выносятся одной группой и без остатка. Подтверждаемые
 * операции (удаление страницы, откат версии) живут в своих композаблах по тому же
 * образцу.
 *
 * @param options - Показ тостов (владеет им дашборд).
 * @returns Состояние копирования, лайтбокс миниатюры и сами действия.
 */
export function usePublishPageActions(
    options: IUsePublishPageActionsOptions
): IUsePublishPageActionsReturn {
    // #region Data
    const { t } = useI18n();
    const publishStore = usePublishStore();
    const { generatePreviewUrl } = usePublishPreview();

    const duplicatingPageId = ref<string | null>(null);
    const thumbnailPreviewItem = ref<TMediaLightboxItem | null>(null);
    // #endregion

    // #region Methods
    /**
     * Оптимистично переключает статус публикации; при отказе возвращает прежний.
     *
     * Оптимистично — в отличие от операций над учётками: тумблер публикации
     * человек щёлкает и сразу смотрит на результат, и задержка на круг до сервера
     * читалась бы как незалипающая кнопка. Цена — откат при отказе, и он
     * возможен, потому что прежнее значение известно точно.
     *
     * @param page - Страница.
     * @param published - Новый флаг публикации.
     */
    async function togglePublished(page: TPublishedPageSummary, published: boolean): Promise<void> {
        const target = publishStore.getPageById(page.id);

        if (!target || target.published === published) {
            return;
        }

        const previousPublished = target.published;
        target.published = published;

        try {
            await publishStore.patchPage(page.id, { published });
        } catch (error: unknown) {
            const current = publishStore.getPageById(page.id);

            if (current) {
                current.published = previousPublished;
            }

            options.onNotify(
                error instanceof Error
                    ? error.message
                    : t('bricks.publish.dashboard.details.toasts.statusFailed'),
                'error'
            );
        }
    }

    /**
     * Дублирует страницу: копия создаётся черновиком с уникальным именем.
     *
     * @param page - Исходная страница.
     */
    async function duplicatePage(page: TPublishedPageSummary): Promise<void> {
        if (duplicatingPageId.value !== null) {
            return;
        }

        duplicatingPageId.value = String(page.id);

        try {
            await publishStore.duplicatePage(page.id);
            options.onNotify(t('bricks.publish.dashboard.toasts.duplicated'), 'success');
        } catch (error: unknown) {
            options.onNotify(
                error instanceof Error
                    ? error.message
                    : t('bricks.publish.dashboard.toasts.duplicateFailed'),
                'error'
            );
        } finally {
            duplicatingPageId.value = null;
        }
    }

    /**
     * Открывает превью страницы в новой вкладке.
     *
     * @param page - Страница.
     */
    function previewPage(page: TPublishedPageSummary): void {
        window.open(generatePreviewUrl(toPageAddress(page.pagename, page.urlPrefix)), '_blank');
    }

    /**
     * Открывает миниатюру страницы в лайтбоксе медиа-галереи.
     *
     * @param page - Страница со снимком.
     */
    function previewThumbnail(page: TPublishedPageSummary): void {
        if (!page.thumbnailUrl) {
            return;
        }

        thumbnailPreviewItem.value = {
            url: page.thumbnailUrl,
            mimeType: 'image/webp',
            alt: page.title || page.pagename,
            filename: `${page.pagename}.webp`,
        };
    }

    /**
     * Закрывает лайтбокс миниатюры.
     */
    function closeThumbnailPreview(): void {
        thumbnailPreviewItem.value = null;
    }
    // #endregion

    return {
        duplicatingPageId,
        thumbnailPreviewItem,
        togglePublished,
        duplicatePage,
        previewPage,
        previewThumbnail,
        closeThumbnailPreview,
    };
}
