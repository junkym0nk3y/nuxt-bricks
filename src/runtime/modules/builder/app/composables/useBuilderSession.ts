// #region Imports
// Types
import type { BricksSchema } from '../../../common/types/brick';
import type { IBuilderDraftEntry, IBuilderDraftSnapshot } from '../../publish/types/builderDrafts';
import type { IBuilderSessionOptions } from '../types/composables';

// Utils
import { serializeSchema } from '../../core/utils/history';
import { isSnapshotEqual } from '../../publish/utils/draftSnapshots';
import { getBuilderDraft, removeBuilderDraft } from '../../publish/utils/draftStorage';

// Vue
import { ref, watch } from 'vue';

// Pinia
import { useComponentsStore } from '../../core/stores/components';
import { usePublishStore } from '../../publish/stores/publish';
// #endregion

const EMPTY_SCHEMA: BricksSchema = {
    components: [],
};

/**
 * Сессия билдера: открытие страницы по pagename (существующая / новая),
 * обнаружение черновика в localStorage и модалка восстановления.
 * Watcher на routePagename переоткрывает сессию при смене маршрута;
 * первичное открытие — на стороне вызывающего (onMounted, см. [pagename].vue).
 */
export function useBuilderSession(options: IBuilderSessionOptions) {
    const { routePagename, showToast } = options;

    const componentsStore = useComponentsStore();
    const publishStore = usePublishStore();

    const isSessionLoading = ref(true);
    const isRestoreDraftModalOpen = ref(false);
    const pendingDraft = ref<IBuilderDraftEntry | null>(null);
    const savedSnapshot = ref<IBuilderDraftSnapshot | null>(null);

    /**
     * Строит актуальный снапшот из стора канваса и publish настроек.
     */
    function buildCurrentSnapshot(): IBuilderDraftSnapshot {
        return {
            schema: serializeSchema(componentsStore.components),
            formState: publishStore.currentFormState,
        };
    }

    /**
     * Применяет снапшот в сторы билдера.
     *
     * @param snapshot - Снапшот для применения.
     */
    function applySnapshot(snapshot: IBuilderDraftSnapshot): void {
        componentsStore.loadSchema(snapshot.schema, { resetHistory: true });
        publishStore.setCurrentFormState(snapshot.formState);
    }

    /**
     * Загружает страницу в билдер по pagename, учитывая черновики.
     *
     * @param pagename - ЧПУ страницы из URL.
     */
    async function openBuilderSession(pagename: string): Promise<void> {
        if (!pagename) {
            return;
        }

        isSessionLoading.value = true;
        isRestoreDraftModalOpen.value = false;
        pendingDraft.value = null;
        savedSnapshot.value = null;

        try {
            if (!publishStore.publishedPages.length) {
                await publishStore.loadAllPages();
            }

            const existingPage = publishStore.getPageByPagename(pagename);
            const draft = getBuilderDraft(pagename);

            if (existingPage) {
                publishStore.startEditingPage(existingPage.id);
                componentsStore.loadSchema(existingPage.schema, { resetHistory: true });

                savedSnapshot.value = buildCurrentSnapshot();

                if (
                    draft &&
                    draft.mode === 'edit' &&
                    draft.draftSnapshot &&
                    !isSnapshotEqual(draft.draftSnapshot, savedSnapshot.value)
                ) {
                    pendingDraft.value = draft;
                    isRestoreDraftModalOpen.value = true;
                    return;
                }

                if (draft && draft.mode === 'edit' && draft.draftSnapshot) {
                    removeBuilderDraft(pagename);
                }

                return;
            }

            publishStore.startNewPublish();
            publishStore.setCurrentFormField('pagename', pagename);
            componentsStore.loadSchema(EMPTY_SCHEMA, { resetHistory: true });

            if (draft?.draftSnapshot) {
                applySnapshot(draft.draftSnapshot);
                showToast('Есть несохранённые изменения', 'error', 30000);
            }
        } catch (error: unknown) {
            const message =
                error instanceof Error ? error.message : 'Не удалось загрузить страницу';
            showToast(message, 'error');
        } finally {
            isSessionLoading.value = false;
        }
    }

    /**
     * Восстанавливает изменения из черновика (для существующей страницы).
     */
    function handleRestoreDraft(): void {
        const draft = pendingDraft.value;
        if (!draft?.draftSnapshot) {
            isRestoreDraftModalOpen.value = false;
            pendingDraft.value = null;
            return;
        }

        applySnapshot(draft.draftSnapshot);
        isRestoreDraftModalOpen.value = false;
        pendingDraft.value = null;
    }

    /**
     * Отказывается от восстановления и удаляет черновик, открывая сохранённую версию.
     */
    function handleDiscardDraft(): void {
        const pagename = routePagename.value;
        if (pagename) {
            removeBuilderDraft(pagename);
        }

        isRestoreDraftModalOpen.value = false;
        pendingDraft.value = null;
    }

    // Без immediate: при immediate колбэк выполняется синхронно в setup ещё до гидрации
    // и успевает заполнить publishStore.currentFormState (pagename из URL), из-за чего
    // клиентский рендер расходится с SSR (hydration mismatch в TheBuilderShellToolbar).
    // Первичное открытие сессии — в onMounted страницы, watcher отвечает только за смену маршрута.
    watch(
        () => routePagename.value,
        (next) => {
            if (!next) {
                return;
            }

            openBuilderSession(next).catch((error: unknown) => {
                console.error('[Builder] Failed to open builder session:', error);
            });
        }
    );

    // После успешного сохранения фиксируем новый «сохранённый» снапшот и убираем черновик
    watch(
        () => publishStore.lastSuccessfulSaveAt,
        () => {
            if (publishStore.editingPageId === null) {
                savedSnapshot.value = null;
                return;
            }

            savedSnapshot.value = buildCurrentSnapshot();
            removeBuilderDraft(routePagename.value);
        }
    );

    return {
        isSessionLoading,
        isRestoreDraftModalOpen,
        pendingDraft,
        savedSnapshot,
        buildCurrentSnapshot,
        openBuilderSession,
        handleRestoreDraft,
        handleDiscardDraft,
    };
}
