// #region Imports
// Types
import type { TPublishedPageSummary } from '../../../common/types/bricks-api';
import type {
    IUsePublishPageDeleteOptions,
    IUsePublishPageDeleteReturn,
} from '../types/composables';

// Utils
import { isRequestTimeoutError } from '../../../common/utils/apiRequestPolicy';
import { getPublishedPagePath } from '../../../common/utils/bricks/routePaths';
import { toPageAddress } from '../../../common/utils/bricks/pageAddress';

// Vue
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';

// Pinia
import { usePublishStore } from '../stores/publish';
// #endregion

/**
 * Confirm-флоу удаления страницы для дашборда: состояние подтверждения, описание
 * с адресом страницы и удаление через publish-стор.
 *
 * Отдельно от хоста по той же причине, что и откат к версии
 * (`usePublishVersionRestore`): подтверждение необратимого действия — это своё
 * состояние, свой текст и своя политика отказов, а хост дашборда и без него
 * собирает шесть модалок.
 *
 * @param options - Уведомления и реакция на удаление.
 * @returns Состояние подтверждения и операции удаления.
 */
export function usePublishPageDelete(
    options: IUsePublishPageDeleteOptions
): IUsePublishPageDeleteReturn {
    // #region Data
    const { t } = useI18n();
    const publishStore = usePublishStore();

    const pendingDeletePage = ref<TPublishedPageSummary | null>(null);
    const isDeleteConfirmationOpen = ref(false);
    const isDeleting = ref(false);
    // #endregion

    // #region Computed
    const deleteConfirmationDescription = computed<string>(() => {
        const page = pendingDeletePage.value;

        if (!page) {
            return t('bricks.publish.dashboard.deleteConfirm.generic');
        }

        return t('bricks.publish.dashboard.deleteConfirm.named', {
            title: page.title,
            // Полный адрес: у одноимённых страниц под разными префиксами путь по
            // одному имени совпадал бы, и при равных заголовках пользователь не
            // понимал бы, какую из них удаляет
            path: getPublishedPagePath(toPageAddress(page.pagename, page.urlPrefix)),
        });
    });
    // #endregion

    // #region Methods
    /**
     * Запрашивает подтверждение удаления страницы.
     *
     * @param page - Страница.
     */
    function requestDeletePage(page: TPublishedPageSummary): void {
        pendingDeletePage.value = page;
        isDeleteConfirmationOpen.value = true;
    }

    /**
     * Закрывает подтверждение удаления.
     *
     * @param force - Закрыть даже во время выполнения удаления.
     */
    function closeDeleteConfirmation(force = false): void {
        if (!force && isDeleting.value) {
            return;
        }

        isDeleteConfirmationOpen.value = false;
        pendingDeletePage.value = null;
    }

    /**
     * Подтверждает и выполняет удаление страницы (файл превью в хранилище
     * best-effort чистит сервер в DELETE /api/bricks/:id).
     *
     * Определённый отказ сервера оставляет подтверждение открытым — страница на
     * месте, и повтор под рукой. Обрыв по потолку ожидания его закрывает: исход
     * неизвестен, страница могла быть удалена, и сообщение об этом прямо просит
     * сначала обновить данные (список стор перечитывает сам), а не повторять.
     */
    async function confirmDeletePage(): Promise<void> {
        const page = pendingDeletePage.value;

        if (!page) {
            return;
        }

        isDeleting.value = true;

        try {
            await publishStore.deletePage(page.id);
            options.onDeleted(String(page.id));
            closeDeleteConfirmation(true);
        } catch (error: unknown) {
            const message =
                error instanceof Error
                    ? error.message
                    : t('bricks.publish.dashboard.toasts.deleteFailed');
            options.onNotify(message, 'error');

            if (isRequestTimeoutError(error)) {
                closeDeleteConfirmation(true);
            }
        } finally {
            isDeleting.value = false;
        }
    }
    // #endregion

    return {
        isDeleteConfirmationOpen,
        isDeleting,
        deleteConfirmationDescription,
        requestDeletePage,
        closeDeleteConfirmation,
        confirmDeletePage,
    };
}
