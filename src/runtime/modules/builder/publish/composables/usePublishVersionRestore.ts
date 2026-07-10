import { computed, ref, type ComputedRef, type Ref } from 'vue';
import { useI18n } from 'vue-i18n';
import type { IPageVersionSummary, IPublishedPage } from '../../../common/types/bricks-api';
import { usePublishStore } from '../stores/publish';
import { formatPageDateTime } from '../utils/dates';

/**
 * Опции `usePublishVersionRestore`.
 */
export interface IUsePublishVersionRestoreOptions {
    onNotify: (message: string, variant: 'success' | 'error') => void;
}

/**
 * Возвращаемое значение `usePublishVersionRestore`.
 */
export interface IUsePublishVersionRestoreReturn {
    isRestoreConfirmationOpen: Ref<boolean>;
    isRestoring: Ref<boolean>;
    restoreConfirmationDescription: ComputedRef<string>;
    requestRestoreVersion: (page: IPublishedPage, version: IPageVersionSummary) => void;
    closeRestoreConfirmation: (force?: boolean) => void;
    confirmRestoreVersion: () => Promise<void>;
}

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

    const pendingRestore = ref<{ page: IPublishedPage; version: IPageVersionSummary } | null>(null);
    const isRestoreConfirmationOpen = ref(false);
    const isRestoring = ref(false);

    const restoreConfirmationDescription = computed<string>(() => {
        const restore = pendingRestore.value;
        if (!restore) {
            return '';
        }

        return t('bricks.publish.dashboard.details.versions.restoreConfirm.description', {
            date: formatPageDateTime(restore.version.createdAt),
        });
    });

    /**
     * Запрашивает подтверждение отката страницы к сохранённой версии.
     *
     * @param page - Страница.
     * @param version - Сводка версии.
     */
    function requestRestoreVersion(page: IPublishedPage, version: IPageVersionSummary): void {
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
