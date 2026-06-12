// #region Imports
// Types
import type { IBuilderDraftPersistenceOptions } from '../types/composables';

// Utils
import { isSnapshotEqual } from '../../publish/utils/draftSnapshots';
import { removeBuilderDraft, setBuilderDraft } from '../../publish/utils/draftStorage';

// Vue
import { onBeforeUnmount, watch } from 'vue';

// Pinia
import { useHistoryStore } from '../../core/stores/history';
import { usePublishStore } from '../../publish/stores/publish';
// #endregion

/**
 * Автосохранение черновика билдера в localStorage (debounce 800ms) при изменении
 * истории канваса или настроек публикации. Если изменений относительно сохранённой
 * версии нет — черновик удаляется. Таймер чистится при unmount.
 */
export function useBuilderDraftPersistence(options: IBuilderDraftPersistenceOptions): void {
    const { routePagename, isSessionLoading, savedSnapshot, buildCurrentSnapshot } = options;

    const historyStore = useHistoryStore();
    const publishStore = usePublishStore();

    let persistTimer: number | null = null;

    /**
     * Очищает таймер отложенного сохранения.
     */
    function clearPersistTimer(): void {
        if (persistTimer === null) {
            return;
        }

        window.clearTimeout(persistTimer);
        persistTimer = null;
    }

    /**
     * Сохраняет черновик в localStorage, если есть несохранённые изменения.
     */
    function persistDraftNow(): void {
        if (typeof window === 'undefined') {
            return;
        }

        const pagename = routePagename.value;
        if (!pagename) {
            return;
        }

        const snapshot = buildCurrentSnapshot();
        const isEditing = publishStore.editingPageId !== null;

        if (isEditing && savedSnapshot.value && isSnapshotEqual(snapshot, savedSnapshot.value)) {
            removeBuilderDraft(pagename);
            return;
        }

        setBuilderDraft({
            pagename,
            updatedAt: new Date().toISOString(),
            mode: isEditing ? 'edit' : 'new',
            pageId:
                typeof publishStore.editingPageId === 'number'
                    ? publishStore.editingPageId
                    : undefined,
            savedSnapshot: savedSnapshot.value ?? undefined,
            draftSnapshot: snapshot,
        });
    }

    /**
     * Планирует сохранение черновика (debounce).
     */
    function scheduleDraftPersist(): void {
        if (typeof window === 'undefined' || isSessionLoading.value) {
            return;
        }

        clearPersistTimer();
        persistTimer = window.setTimeout(() => {
            persistDraftNow();
            clearPersistTimer();
        }, 800);
    }

    watch(
        [() => historyStore.historyIndex, () => publishStore.currentFormState],
        () => {
            scheduleDraftPersist();
        },
        { deep: false }
    );

    onBeforeUnmount(() => {
        clearPersistTimer();
    });
}
