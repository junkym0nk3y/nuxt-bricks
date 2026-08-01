import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import type { IPageVersionSummary, TPublishedPageSummary } from '../../../common/types/bricks-api';
import type {
    IPendingVersionRestore,
    IUsePublishVersionRestoreOptions,
    IUsePublishVersionRestoreReturn,
} from '../types/composables';
import { isRequestTimeoutError } from '../../../common/utils/apiRequestPolicy';
import { usePublishStore } from '../stores/publish';
import { formatPageVersionDateTime } from '../utils/dates';

/**
 * Confirm-флоу отката страницы к версии для дашборда: состояние модалки
 * подтверждения, описание с датой версии и выполнение отката через publish-стор
 * (тосты успеха/ошибки — через `onNotify`).
 */
export function usePublishVersionRestore(
    options: IUsePublishVersionRestoreOptions
): IUsePublishVersionRestoreReturn {
    const { t } = useI18n();
    const publishStore = usePublishStore();

    const pendingRestore = ref<IPendingVersionRestore | null>(null);
    const isRestoreConfirmationOpen = ref(false);
    const isRestoring = ref(false);

    const restoreConfirmationDescription = computed<string>(() => {
        const restore = pendingRestore.value;
        if (!restore) {
            return '';
        }

        // Та же дата, которой подписана карточка версии в галерее: подтверждение
        // необратимого действия обязано называть выбранное состояние так же
        return t('bricks.publish.dashboard.details.versions.restoreConfirm.description', {
            date: formatPageVersionDateTime(restore.version),
        });
    });

    /**
     * Запрашивает подтверждение отката страницы к сохранённой версии.
     *
     * @param page - Страница.
     * @param version - Сводка версии.
     */
    function requestRestoreVersion(
        page: TPublishedPageSummary,
        version: IPageVersionSummary
    ): void {
        pendingRestore.value = { page, version };
        isRestoreConfirmationOpen.value = true;
    }

    /**
     * Закрывает подтверждение отката.
     *
     * @param force - Закрыть даже во время выполнения отката.
     */
    function closeRestoreConfirmation(force = false): void {
        if (!force && isRestoring.value) {
            return;
        }

        isRestoreConfirmationOpen.value = false;
        pendingRestore.value = null;
    }

    /**
     * Подтверждает и выполняет откат к версии (schema + layout + backgroundColor).
     *
     * Определённый отказ оставляет подтверждение открытым — повтор безопасен и
     * под рукой. Обрыв по потолку ожидания его закрывает: исход неизвестен, откат
     * мог примениться, и сообщение об этом просит сначала обновить данные (список
     * стор перечитывает сам), а повторный откат ушёл бы с устаревшей revision.
     */
    async function confirmRestoreVersion(): Promise<void> {
        const restore = pendingRestore.value;
        if (!restore) {
            return;
        }

        isRestoring.value = true;
        try {
            await publishStore.restorePageVersion(restore.page.id, restore.version.id);
            options.onNotify(
                t('bricks.publish.dashboard.details.versions.toasts.restored'),
                'success'
            );
            closeRestoreConfirmation(true);
        } catch (error: unknown) {
            const message =
                error instanceof Error
                    ? error.message
                    : t('bricks.publish.dashboard.details.versions.toasts.restoreFailed');
            options.onNotify(message, 'error');

            if (isRequestTimeoutError(error)) {
                closeRestoreConfirmation(true);
            }
        } finally {
            isRestoring.value = false;
        }
    }

    return {
        isRestoreConfirmationOpen,
        isRestoring,
        restoreConfirmationDescription,
        requestRestoreVersion,
        closeRestoreConfirmation,
        confirmRestoreVersion,
    };
}
