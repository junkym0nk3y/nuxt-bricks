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
    const { renameSession, isSessionReady } = options;
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
     * Разрешает ли состояние стора переносить сессию по форме: сессия открыта до
     * согласованного состояния, страница ещё не сохранена (rename существующей
     * применяется при сохранении, см. useBuilderPage) и запись не идёт.
     *
     * Проверка `isSubmitting` — не перестраховка: `saveCurrentPageAsCopy` на время
     * POST ставит `editingPageId = null` и pagename копии в форму, то есть для этого
     * watcher'а форма выглядит как новая страница. Слаг копии на сервере ещё не
     * занят, поэтому перенос проходил бы все остальные проверки, а при ошибке
     * запроса store откатывал бы форму — URL и ключ черновика оставались бы на
     * слаге несуществующей копии.
     *
     * Проверка готовности закрывает вторую дыру того же класса: переименование в
     * незавершённом открытии меняет `sessionPagename` и URL, но не поколение сессии,
     * а watcher маршрута новое открытие после этого сознательно пропускает
     * (route догнал sessionPagename). Незавершённый bootstrap считался бы актуальным
     * и применил бы прежнюю страницу под новым ключом (находка ревью).
     *
     * @returns Можно ли переносить сессию сейчас.
     */
    function isSessionRenamable(): boolean {
        return (
            isSessionReady.value &&
            publishStore.editingPageId === null &&
            !publishStore.isSubmitting
        );
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

            // Ранние выходы снимают уже поставленный таймер: он планировался под
            // прежнее состояние формы, а к моменту срабатывания оно другое
            if (!isSessionRenamable()) {
                clearPagenameTimer();
                return;
            }

            const normalized = String(next ?? '').trim();
            if (!normalized || !isValidPagename(normalized)) {
                clearPagenameTimer();
                return;
            }

            // Debounce: URL и ключ черновика догоняют форму после паузы в наборе
            clearPagenameTimer();
            pagenameRouteTimer = window.setTimeout(() => {
                pagenameRouteTimer = null;

                // Режим и запись перепроверяем на момент срабатывания: за окно
                // debounce страницу могли сохранить или начать сохранять
                if (!isSessionRenamable()) {
                    return;
                }

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
