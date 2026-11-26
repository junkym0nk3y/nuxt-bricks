// #region Imports
// Types
import type { IBuilderPageOptions, IUseBuilderPageReturn } from '../types/composables';

// Utils
import { runSaveWhenSessionReady } from '../utils/sessionGuards';

// Vue
import { useI18n } from 'vue-i18n';

// Composables
import { useBuilderWorkspace } from './useBuilderWorkspace';
import { useBuilderComponentLibrary } from './useBuilderComponentLibrary';
import { useBuilderPageWrite } from './useBuilderPageWrite';
import { usePreviewSync } from './usePreviewSync';
import { usePublishPreview } from '../../publish/composables/usePublishPreview';

// Pinia
import { useComponentsStore } from '../../core/stores/components';
import { useSidebarStore } from '../../core/stores/sidebar';
import { usePublishStore } from '../../publish/stores/publish';
// #endregion

/**
 * Assembles the whole business logic of the builder page and hands the Vue
 * component the states it needs alone: the workspace shared with the editor of a
 * template (`useBuilderWorkspace`) plus the page's own part — the publish settings,
 * the writes and the preview.
 *
 * @param options - The bridge of the inline editor, the move and the commit of the
 * session, the session token; everything is assembled by the composition root
 * (`pages/[pagename].vue`) so that the core of the builder does not depend on the
 * editor and owns the session in one place.
 */
export async function useBuilderPage(options: IBuilderPageOptions): Promise<IUseBuilderPageReturn> {
    const {
        inlineMediaBridge,
        renameSession,
        switchToSavedPage,
        commitSavedSnapshot,
        sessionToken,
        isSessionReady,
    } = options;

    // #region Stores & Composables
    const { t } = useI18n();
    const componentsStore = useComponentsStore();
    const sidebarStore = useSidebarStore();
    const publishStore = usePublishStore();

    const workspace = useBuilderWorkspace({ inlineMediaBridge, sessionToken });
    const { showToast } = workspace;

    const { startPreviewSync } = usePreviewSync(sessionToken);
    const { previewCurrentPage } = usePublishPreview();
    // #endregion

    // #region Publish handlers
    /**
     * Opens the panel of the publish settings. When the panel is not visible yet and
     * there is no draft data, it initializes a new publication.
     */
    function handleOpenPublishSettings(): void {
        const isPublishViewVisible =
            sidebarStore.left.visible && sidebarStore.activeView === 'publish';
        if (!isPublishViewVisible) {
            const { pagename, title, description } = publishStore.currentFormState;
            const hasDraftData =
                (pagename ?? '').trim().length > 0 ||
                (title ?? '').trim().length > 0 ||
                (description ?? '').trim().length > 0;

            if (!hasDraftData && publishStore.editingPageId === null) {
                publishStore.startNewPublish();
            } else {
                publishStore.clearErrors();
            }
        }
        sidebarStore.toggleSidebarView('publish');
    }

    /**
     * Guarantees the visibility of the panel of the publish settings — a refused
     * write calls it so that the fields and the general error are lit up.
     *
     * It shows the panel rather than reusing `handleOpenPublishSettings`, which is
     * the toggle behind the rail button and does two things wrong here: on an
     * already open publish panel it would CLOSE it, and on a hidden one it wipes the
     * very message the caller wants shown (`clearErrors`, or `startNewPublish` on an
     * empty form). No text is passed in: the panel reads `publishStore.generalError`
     * itself, and a second source of the same string would drift from the store.
     */
    function ensurePublishSettingsVisible(): void {
        sidebarStore.showSidebarView('publish');
    }

    const {
        currentPublishPageTitle,
        handleSaveDraft: saveDraft,
        handleSaveAsCopy: saveAsCopy,
    } = useBuilderPageWrite({
        sessionToken,
        renameSession,
        switchToSavedPage,
        commitSavedSnapshot,
        ensurePublishSettingsVisible,
    });

    /**
     * Saves the page into a consistent session alone (the rule itself is in
     * `runSaveWhenSessionReady`). Every action of the toolbar that reads the canvas
     * asks about the readiness here rather than in the composition root: in a
     * template the rule could only be verified by its text, and such a check stays
     * green over, say, a lost `return`.
     */
    async function handleSaveDraft(): Promise<void> {
        await runSaveWhenSessionReady({
            isSessionReady: () => isSessionReady.value,
            save: saveDraft,
            onBlocked: () => showToast(t('bricks.publish.session.saveBlocked'), 'error'),
        });
    }

    /**
     * The same for the save of a copy.
     */
    async function handleSaveAsCopy(): Promise<void> {
        await runSaveWhenSessionReady({
            isSessionReady: () => isSessionReady.value,
            save: saveAsCopy,
            onBlocked: () => showToast(t('bricks.publish.session.saveBlocked'), 'error'),
        });
    }

    /**
     * Opens the preview of the current landing in a new tab. After the opening it
     * starts the synchronization — the changes on the canvas will show up in the
     * preview in real time.
     *
     * The readiness of the session is checked before the export rather than trusted
     * to the disabled state of the button: with the screen of a refused bootstrap up,
     * the toolbar deliberately stays live (the retry and the way out sit there), and
     * the canvas at that moment holds either nothing or the remains of the previous
     * page. A preview built out of those would be written into the preview storage
     * and shown as the page a person is looking at.
     */
    async function handlePreview(): Promise<void> {
        if (!isSessionReady.value) {
            showToast(t('bricks.publish.session.previewBlocked'), 'error');

            return;
        }

        const schema = componentsStore.exportSchema();
        const previewAddress = previewCurrentPage(schema);

        if (previewAddress && import.meta.client) {
            startPreviewSync(previewAddress);
        } else if (!previewAddress) {
            showToast(
                publishStore.generalError || t('bricks.publish.toasts.previewFailed'),
                'error'
            );
        }
    }
    // #endregion

    // The single await of the composable, and its last statement — why, at
    // `useBuilderComponentLibrary`
    const library = await useBuilderComponentLibrary();

    return {
        ...workspace,
        ...library,
        publishStore,
        currentPublishPageTitle,
        handleOpenPublishSettings,
        handleSaveDraft,
        handleSaveAsCopy,
        handlePreview,
    };
}
