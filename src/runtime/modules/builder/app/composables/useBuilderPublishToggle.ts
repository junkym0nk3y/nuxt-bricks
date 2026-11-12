// #region Imports
// Types
import type {
    IUseBuilderPublishToggleOptions,
    IUseBuilderPublishToggleReturn,
} from '../types/composables';

// Vue
import { watch } from 'vue';
import { useI18n } from 'vue-i18n';

// Pinia
import { usePublishStore } from '../../publish/stores/publish';
// #endregion

/**
 * The publication switch of the open page in the publish settings of the editor.
 *
 * The flag is written to the server at once, by the same targeted PATCH as the switch of
 * the dashboard, rather than waiting for "Save": the switch in both places has to mean
 * one thing, and a flag held until a save is lost by leaving the editor. What the switch
 * publishes is the last SAVED state of the page — unsaved edits of the canvas are not a
 * part of the PATCH, exactly as on the dashboard.
 *
 * Two places hold the flag in the editor, and both are kept in step: the row of the list
 * — the PATCH answer puts it in (`syncPageInList`), together with the fresh revision the
 * next save goes out with — and the publish form, which every save sends `published` out
 * of: a form left with the former value would take the publication back on the next
 * "Save". The drafts take no part in it: the flag is not an unsaved edit, so the
 * comparison of a draft with the saved state leaves it out and a restored draft keeps
 * the flag of the form (`draftSnapshots`, `useBuilderSessionSnapshot.applySnapshot`).
 *
 * The toggle claims the write registry of the current page (`beginWrite`), so it never
 * runs next to a save: a PUT in flight carries the former flag and would take the
 * publication back, and a PATCH landing first would turn that PUT into a conflict. The
 * registry also blocks "Save" and the form for the duration — the toggle is one short
 * request.
 *
 * Optimistic, like the dashboard switch: a delay of one round trip would read as a switch
 * that does not latch. A refusal brings back the flag of the server — out of the row of
 * the list, which the PATCH leaves alone until it succeeds — and only in the session the
 * toggle started in. Not the flag from before the request: a conflict refreshes the list
 * before the refusal arrives, and the server may hold the new value by then (somebody
 * else set the same flag), so a blind rollback would put the stale one back.
 *
 * A refusal is not always a "no" either: a PATCH aborted by the timeout leaves the outcome
 * unknown, the server may have applied it, and only the re-read of the list started by
 * `toPageWriteError` can tell — after the refusal, without being waited for. So the form
 * follows the row of the list besides: whenever the server flag of the open page changes
 * there, the form takes it. Without that the rollback of an applied write left the form
 * with the former flag while the server held the new one, and the next save took the
 * publication back unnoticed. The same rule covers a refresh of the list after the flag
 * was changed on the dashboard, and the rollback of a failed save follows it as well
 * (`useBuilderPageWrite`).
 *
 * @param options - The session token and the toasts.
 * @returns The toggle handler.
 */
export function useBuilderPublishToggle(
    options: IUseBuilderPublishToggleOptions
): IUseBuilderPublishToggleReturn {
    const { sessionToken, showToast } = options;

    // #region Data
    const { t } = useI18n();
    const publishStore = usePublishStore();
    // #endregion

    // #region Methods
    /**
     * Writes the publication flag of the open page; on a refusal brings the previous one
     * back and reports the reason.
     *
     * @param published - The new publication flag.
     */
    async function handleTogglePublished(published: boolean): Promise<void> {
        const pageId = publishStore.editingPageId;

        // A page that has never been saved has no row to patch: its flag travels with
        // the first save
        if (pageId === null || publishStore.currentFormState.published === published) {
            return;
        }

        const writeId = publishStore.beginWrite();

        if (writeId === null) {
            return;
        }

        const startedIn = sessionToken.capture();
        const previousPublished = publishStore.currentFormState.published;
        // The label is taken before the await: after it the form may belong to another
        // page, and a refusal reported over that page has to say which page it is about
        const { title, pagename } = publishStore.currentFormState;
        const pageLabel = (title ?? '').trim() || (pagename ?? '').trim();

        publishStore.setCurrentFormField('published', published);

        try {
            await publishStore.patchPage(pageId, { published });
        } catch (error: unknown) {
            const isCurrent = sessionToken.isCurrent(startedIn);

            if (isCurrent) {
                publishStore.setCurrentFormField(
                    'published',
                    publishStore.editingPageSavedPublished ?? previousPublished
                );
            }

            const message =
                error instanceof Error
                    ? error.message
                    : t('bricks.publish.dashboard.details.toasts.statusFailed');

            showToast(
                isCurrent || !pageLabel
                    ? message
                    : t('bricks.publish.toasts.forPage', { page: pageLabel, message }),
                'error'
            );
        } finally {
            publishStore.endWrite(writeId);
        }
    }
    // #endregion

    // #region Lifecycle
    watch(
        () => publishStore.editingPageSavedPublished,
        (published) => {
            if (published === null || publishStore.currentFormState.published === published) {
                return;
            }

            publishStore.setCurrentFormField('published', published);
        }
    );
    // #endregion

    return {
        handleTogglePublished,
    };
}
