// #region Imports
// Types
import type { IBricksPageAddress } from '../../../common/types/pageAddress';
import type { IBuilderSessionAddressSyncOptions } from '../types/composables';

// Utils
import {
    getPageAddressKey,
    isValidPageAddress,
    toPageAddress,
} from '../../../common/utils/bricks/pageAddress';

// Vue
import { onScopeDispose, watch } from 'vue';

// Composables
import { useBricksPageAddress } from '../../../common/composables/useBricksPageAddress';

// Pinia
import { usePublishStore } from '../../publish/stores/publish';
// #endregion

const ADDRESS_SYNC_DEBOUNCE_MS = 600;

/**
 * Синхронизация URL с адресом из настроек публикации (debounce 600ms):
 * для новой (несохранённой) страницы переносит сессию на новый адрес через
 * `renameSession` — черновик localStorage мигрирует, URL меняется через Vue Router.
 * Для существующей страницы rename применяется при сохранении (см. useBuilderPage).
 *
 * Следит за парой `pagename + urlPrefix`, а не за одним именем: адрес редактора
 * включает префикс, поэтому смена префикса — такой же перенос сессии, как
 * переименование, и без неё URL с ключом черновика остались бы на прежнем адресе.
 */
export function useBuilderSessionAddressSync(options: IBuilderSessionAddressSyncOptions): void {
    const { renameSession, isSessionReady } = options;
    const publishStore = usePublishStore();
    const { isEditorAddressFree } = useBricksPageAddress();

    let addressRouteTimer: number | null = null;

    /**
     * Останавливает отложенную синхронизацию.
     */
    function clearAddressTimer(): void {
        if (addressRouteTimer !== null) {
            window.clearTimeout(addressRouteTimer);
            addressRouteTimer = null;
        }
    }

    /**
     * Разрешает ли состояние стора переносить сессию по форме: сессия открыта до
     * согласованного состояния, страница ещё не сохранена (rename существующей
     * применяется при сохранении, см. useBuilderPage) и запись не идёт.
     *
     * Проверка `isSubmitting` — не перестраховка: `saveCurrentPageAsCopy` на время
     * POST ставит `editingPageId = null` и адрес копии в форму, то есть для этого
     * watcher'а форма выглядит как новая страница. Адрес копии на сервере ещё не
     * занят, поэтому перенос проходил бы все остальные проверки, а при ошибке
     * запроса store откатывал бы форму — URL и ключ черновика оставались бы на
     * адресе несуществующей копии.
     *
     * Проверка готовности закрывает вторую дыру того же класса: переименование в
     * незавершённом открытии меняет `sessionAddress` и URL, но не поколение сессии,
     * а watcher маршрута новое открытие после этого сознательно пропускает
     * (route догнал sessionAddress). Незавершённый bootstrap считался бы актуальным
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
     * Проверяет, что адрес пригоден для переноса сессии: валидный формат,
     * свободный адрес РЕДАКТОРА, не занят другой страницей.
     *
     * Live-адрес здесь не при чём: перенос меняет URL редактора, а занятый
     * live-адрес и так держит форму невалидной и блокирует запись.
     *
     * @param address - Адрес-кандидат из формы.
     */
    function isRenameTarget(address: IBricksPageAddress): boolean {
        return (
            isValidPageAddress(address) &&
            isEditorAddressFree(address) &&
            publishStore.isAddressAvailable(address)
        );
    }

    /**
     * Адрес, собранный из текущих полей формы.
     *
     * @returns Нормализованный адрес формы.
     */
    function resolveFormAddress(): IBricksPageAddress {
        return toPageAddress(
            String(publishStore.currentFormState.pagename ?? ''),
            publishStore.currentFormState.urlPrefix
        );
    }

    // Наблюдаем КЛЮЧ адреса, а не сам объект: объект пересобирается на каждый
    // прогон геттера, поэтому сравнение по ссылке считало бы изменением любую
    // перезапись формы — например служебную (`setCurrentFormState` после
    // сохранения). Ключ — строка, и watcher срабатывает только на настоящую
    // смену адреса.
    watch(
        () => getPageAddressKey(resolveFormAddress()),
        () => {
            if (typeof window === 'undefined') {
                return;
            }

            // Ранние выходы снимают уже поставленный таймер: он планировался под
            // прежнее состояние формы, а к моменту срабатывания оно другое
            if (!isSessionRenamable()) {
                clearAddressTimer();
                return;
            }

            if (!isValidPageAddress(resolveFormAddress())) {
                clearAddressTimer();
                return;
            }

            // Debounce: URL и ключ черновика догоняют форму после паузы в наборе
            clearAddressTimer();
            addressRouteTimer = window.setTimeout(() => {
                addressRouteTimer = null;

                // Режим и запись перепроверяем на момент срабатывания: за окно
                // debounce страницу могли сохранить или начать сохранять
                if (!isSessionRenamable()) {
                    return;
                }

                const current = resolveFormAddress();

                if (!isRenameTarget(current)) {
                    return;
                }

                renameSession(current).catch((error: unknown) => {
                    console.warn('[Builder] Failed to sync page address to URL:', error);
                });
            }, ADDRESS_SYNC_DEBOUNCE_MS);
        }
    );

    onScopeDispose(clearAddressTimer);
}
