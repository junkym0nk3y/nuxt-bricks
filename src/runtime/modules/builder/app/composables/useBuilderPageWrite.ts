// #region Imports
// Types
import type { IBuilderPageWriteOptions, IUseBuilderPageWriteReturn } from '../types/composables';

// Utils
import { toPageAddress } from '../../../common/utils/bricks/pageAddress';

// Vue
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

// Composables
import { useBuilderToast } from '../../core/composables/useBuilderToast';
import { usePageThumbnail } from './usePageThumbnail';

// Pinia
import { useComponentsStore } from '../../core/stores/components';
import { usePublishStore } from '../../publish/stores/publish';
// #endregion

/**
 * Writing the open page of the builder: the save (a draft or a publication) and
 * Save as Copy together with the move of the session, the preview snapshot for the
 * dashboard and the toasts of the outcome.
 *
 * Split out of the facade of the page: the writing operations hold a whole logic of
 * their own — the check of the session token, the order of the move onto the saved
 * address, the page context in the messages — and inside the shared facade it got
 * in the way of the wiring of the shell.
 *
 * @param options - The session token, the move and the commit of the session and
 * the opening of the publish panel: they belong to the composition root rather than
 * to the write.
 */
export function useBuilderPageWrite(options: IBuilderPageWriteOptions): IUseBuilderPageWriteReturn {
    const { sessionToken, renameSession, switchToSavedPage, commitSavedSnapshot } = options;

    // #region Stores & Composables
    const { t } = useI18n();
    const componentsStore = useComponentsStore();
    const publishStore = usePublishStore();
    const { showToast } = useBuilderToast();
    const { captureAndUploadThumbnail } = usePageThumbnail(sessionToken);
    // #endregion

    // #region Computed
    const isEditingExistingPage = computed(() => publishStore.editingPageId !== null);
    const currentPublishPageTitle = computed(() => {
        const { title, pagename } = publishStore.currentFormState;
        return (title ?? '').trim() || (pagename ?? '').trim() || '';
    });
    // #endregion

    // #region Methods
    /**
     * Ascribes to a message the page it is about. Needed for the operations that
     * arrived in an already different session only: another page is on the screen
     * there, and without the label the message looks as if it were about that one.
     *
     * @param message - The text of the message.
     * @param pageLabel - The page label taken at the start of the operation.
     * @returns The message with the context, or the original one when there is no
     * label.
     */
    function withPageContext(message: string, pageLabel: string): string {
        if (!pageLabel) {
            return message;
        }

        return t('bricks.publish.toasts.forPage', { page: pageLabel, message });
    }

    /**
     * Saves the landing with the given publication status. On a success it shows a
     * toast with the message, on a failure it rolls the status back.
     *
     * @param published - The publication flag (true = published, false = a draft).
     * @param successMessage - The message to show on a success.
     * @returns true on a successful save, false on a failure.
     */
    async function submitPageWithPublishState(
        published: boolean,
        successMessage: string
    ): Promise<boolean> {
        // A repeated action while a write is under way is not a failure: there is
        // nothing to report about it, and without this exit `publishCurrentPage`
        // would return `null` (a write is already running) and the failure path
        // would show a "could not save" toast over a save going along normally. The
        // substitution of `published` below is inadmissible before the exit as well
        // — it would outlive the rollback of somebody else's operation
        if (publishStore.isSubmitting) {
            return false;
        }

        const previousPublished = publishStore.currentFormState.published;
        publishStore.setCurrentFormField('published', published);
        const schema = componentsStore.exportSchema();
        const startedIn = sessionToken.capture();
        // The label is taken before the await: after it the form belongs to the
        // page open by then, and the toast of a displaced operation would name the
        // wrong one
        const operationPageLabel = currentPublishPageTitle.value;
        const result = await publishStore.publishCurrentPage(schema, {
            isInitiatorCurrent: () => sessionToken.isCurrent(startedIn),
        });

        // A save of the former page arriving after a new one has been opened is
        // none of the new one's business: `startEditingPage` would rewrite the form,
        // `commitSavedSnapshot` would declare its draft superfluous and remove it,
        // the preview snapshot would shoot the wrong canvas, and `renameSession`
        // would take the URL away. The fact of the write is still reported — the
        // person's page really has been saved
        const isCurrent = sessionToken.isCurrent(startedIn);

        if (result !== null) {
            if (!isCurrent) {
                showToast(withPageContext(successMessage, operationPageLabel), 'success');
                return true;
            }

            showToast(successMessage, 'success');

            if (publishStore.editingPageId === null) {
                publishStore.startEditingPage(result);
            }

            // Fire-and-forget: the page preview for the dashboard, the save is not
            // blocked by it
            captureAndUploadThumbnail(result, startedIn);

            // The whole address of the form: a save may have changed the prefix
            // too, and the URL of the editor includes it — a move by the name alone
            // would take the editor onto an address the page does not have
            const currentAddress = toPageAddress(
                publishStore.currentFormState.pagename,
                publishStore.currentFormState.urlPrefix
            );

            if (currentAddress.pagename) {
                // The session is moved onto the saved address (the URL plus the
                // key of the drafts), then the snapshot is committed and the draft
                // under the current key is swept up. The token is passed inside:
                // `renameSession` awaits `router.replace`, and a navigation caught
                // within that time would make the commit somebody else's
                await renameSession(currentAddress);
                commitSavedSnapshot(startedIn);
            }
            return true;
        }

        // `generalError` is a field of the form of the page open by now: for a
        // displaced operation it is not about that operation (or is empty, when the
        // new form has been cleared already), so only the generic text with the page
        // label goes into its toast
        if (!isCurrent) {
            showToast(
                withPageContext(t('bricks.publish.toasts.savePageFailed'), operationPageLabel),
                'error'
            );
            return false;
        }

        const errorMessage = publishStore.generalError || t('bricks.publish.toasts.savePageFailed');
        showToast(errorMessage, 'error');

        publishStore.setCurrentFormField('published', previousPublished);
        options.ensurePublishSettingsVisible(errorMessage);
        return false;
    }

    /**
     * Saves the landing as a draft or updates an existing page. The message depends
     * on whether an existing page is being edited and on its publication status.
     */
    async function handleSaveDraft(): Promise<void> {
        const published = publishStore.currentFormState.published;
        const message = isEditingExistingPage.value
            ? published
                ? t('bricks.publish.toasts.pageUpdated')
                : t('bricks.publish.toasts.draftUpdated')
            : published
              ? t('bricks.publish.toasts.pagePublished')
              : t('bricks.publish.toasts.draftSaved');
        await submitPageWithPublishState(published, message);
    }

    /**
     * Saves the current landing as a copy with a new id. The single move of the
     * session (`switchToSavedPage`, in the fixed order: the store into edit mode →
     * renameSession → savedSnapshot) is carried out before the toast and the
     * thumbnail — otherwise the URL and the key of the localStorage draft stay
     * behind from the original (the autosave of the copy would write its content
     * under the slug of the original, and a reload of the original would offer to
     * restore somebody else's data).
     */
    async function handleSaveAsCopy(): Promise<void> {
        // For the same reason as in the ordinary save: a refusal of the guard of
        // the store is indistinguishable here from a failure to create the copy and
        // would give a false toast
        if (publishStore.isSubmitting) {
            return;
        }

        const schema = componentsStore.exportSchema();
        const startedIn = sessionToken.capture();
        // The label of the source page is taken before the await, for the same
        // reason as in the ordinary save
        const operationPageLabel = currentPublishPageTitle.value;
        const copy = await publishStore.saveCurrentPageAsCopy(schema, {
            isInitiatorCurrent: () => sessionToken.isCurrent(startedIn),
        });

        const isCurrent = sessionToken.isCurrent(startedIn);

        if (copy === null) {
            if (!isCurrent) {
                showToast(
                    withPageContext(t('bricks.publish.toasts.copyFailed'), operationPageLabel),
                    'error'
                );
                return;
            }

            const errorMessage = publishStore.generalError || t('bricks.publish.toasts.copyFailed');
            showToast(errorMessage, 'error');
            options.ensurePublishSettingsVisible(errorMessage);
            return;
        }

        const copySavedMessage = t('bricks.publish.toasts.copySaved');

        // The person left for another page while the POST was in flight: the copy
        // is created and is in the list already — the fact is reported, but moving
        // somebody else's session onto it is not allowed, and the preview snapshot
        // would shoot the wrong canvas. The label is the created copy's rather than
        // the source page's: what the person will look for in the list is the copy
        if (!isCurrent) {
            showToast(withPageContext(copySavedMessage, copy.title || copy.pagename), 'success');
            return;
        }

        await switchToSavedPage(copy);

        // The second asynchronous boundary: the move awaits `router.replace`, and
        // within that time the person may have been taken onto another page.
        // `commitSavedSnapshot` and the preview snapshot are protected by token
        // checks of their own, the toast is not: without this check it would land
        // over somebody else's page carrying no name of the copy
        if (!sessionToken.isCurrent(startedIn)) {
            showToast(withPageContext(copySavedMessage, copy.title || copy.pagename), 'success');
            return;
        }

        showToast(copySavedMessage, 'success');

        // Fire-and-forget: a copy has an S3 preview key of its own — the shot is
        // taken right after the save. The token is the one from the start of Save as
        // Copy: `switchToSavedPage` above awaits `router.replace`, and a navigation
        // caught within that time would otherwise shoot the wrong canvas under the
        // id of the copy
        captureAndUploadThumbnail(copy.id, startedIn);
    }
    // #endregion

    return {
        currentPublishPageTitle,
        handleSaveDraft,
        handleSaveAsCopy,
    };
}
