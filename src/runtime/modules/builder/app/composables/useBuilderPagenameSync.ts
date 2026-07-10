// #region Imports
// Types
import type { IBuilderPagenameSyncOptions } from '../types/composables';

// Utils
import { isValidPagename } from '../../publish/utils/draftSnapshots';
import { RESERVED_PAGENAMES } from '../../../common/constants/publish';

// Vue
import { onScopeDispose, watch } from 'vue';

// Pinia
import { usePublishStore } from '../../publish/stores/publish';
// #endregion

const PAGENAME_SYNC_DEBOUNCE_MS = 600;

/**
 * Синхронизация URL с pagename из настроек публикации (debounce 600ms):
 * для новой (несохранённой) страницы переносит сессию на новый pagename через
 * `renameSession` — черновик localStorage мигрирует, URL меняется через Vue Router.
 * Для существующей страницы rename применяется при сохранении (см. useBuilderPage).
 */
export function useBuilderPagenameSync(options: IBuilderPagenameSyncOptions): void {
    const { renameSession } = options;
    const publishStore = usePublishStore();

    let pagenameRouteTimer: number | null = null;

    /**
     * Останавливает отложенную синхронизацию.
     */
    function clearPagenameTimer(): void {
        if (pagenameRouteTimer !== null) {
            window.clearTimeout(pagenameRouteTimer);
            pagenameRouteTimer = null;
        }
    }

    /**
     * Проверяет, что pagename пригоден для переноса сессии:
     * валидный формат, не зарезервирован и не занят другой страницей.
     *
     * @param value - Кандидат pagename.
     */
    function isRenameTarget(value: string): boolean {
        return (
            Boolean(value) &&
            isValidPagename(value) &&
            !RESERVED_PAGENAMES.includes(value) &&
            publishStore.isPagenameAvailable(value)
        );
    }

    watch(
        () => publishStore.currentFormState.pagename,
        (next) => {
            if (typeof window === 'undefined') {
                return;
            }

            // Не синхронизируем URL при редактировании существующей страницы
            if (publishStore.editingPageId !== null) {
                return;
            }

            const normalized = String(next ?? '').trim();
            if (!normalized || !isValidPagename(normalized)) {
                return;
            }

            // Debounce: URL и ключ черновика догоняют форму после паузы в наборе
            clearPagenameTimer();
            pagenameRouteTimer = window.setTimeout(() => {
                pagenameRouteTimer = null;

                const current = String(publishStore.currentFormState.pagename ?? '').trim();
                if (!isRenameTarget(current)) {
                    return;
                }

                renameSession(current).catch((error: unknown) => {
                    console.warn('[Builder] Failed to sync pagename to URL:', error);
                });
            }, PAGENAME_SYNC_DEBOUNCE_MS);
        }
    );

    onScopeDispose(clearPagenameTimer);
}
