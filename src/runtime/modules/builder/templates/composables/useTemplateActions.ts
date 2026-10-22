// #region Imports
// Types
import type { TBricksTemplateSummary } from '../../../common/types/templates';
import type { IUseTemplateActionsOptions, IUseTemplateActionsReturn } from '../types/templates';

// Utils
import { deleteTemplateRequest } from '../utils/templatesApi';
import { resolveTemplateActionErrorKey } from '../utils/templateErrors';
import { isRequestTimeoutError } from '../../../common/utils/apiRequestPolicy';

// Vue
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';

// Composables
import { useTemplatesData } from './useTemplatesData';
// #endregion

/**
 * The operations over a template: the confirmation and the deletion.
 *
 * The busy state is one per section rather than a set of busy cards. On neighboring
 * cards parallelism is technically possible — the list is edited by `id`, and the
 * answers of different cards do not collide — but it is not needed: there is one
 * confirmation dialog for the section, so the deletions are lined up by the interface
 * anyway, and the price of a set would be a couple of busy cards on screen and a set of
 * busy `id`s instead of one.
 *
 * Renaming does not belong here: it has a form of its own, with fields and validation
 * (`useTemplateRenameForm`), while here are the actions that take no input.
 *
 * @param options - Showing a toast.
 * @returns The state of the confirmation and the operations.
 */
export function useTemplateActions(options: IUseTemplateActionsOptions): IUseTemplateActionsReturn {
    // #region Data
    const { t } = useI18n();
    const { removeTemplate, refreshTemplates } = useTemplatesData();

    /** The template whose deletion is being confirmed; `null` — the dialog is closed */
    const confirmTarget = ref<TBricksTemplateSummary | null>(null);
    const pendingTemplateId = ref<number | null>(null);
    const isDeleting = ref(false);
    // #endregion

    // #region Computed
    const isDeleteConfirmOpen = computed<boolean>(() => confirmTarget.value !== null);

    /**
     * The text of the confirmation says exactly this much: the deletion breaks nothing.
     * The pages created from the template do not change — they hold no tie to it.
     * Without that said, the deletion would read as a risky one.
     */
    const deleteConfirmDescription = computed<string>(() =>
        confirmTarget.value
            ? t('bricks.templates.deleteConfirm.description', { name: confirmTarget.value.name })
            : ''
    );
    // #endregion

    // #region Methods
    /**
     * Asks for a confirmation of the deletion of a template.
     *
     * @param template - The template.
     */
    function requestDelete(template: TBricksTemplateSummary): void {
        if (pendingTemplateId.value !== null) {
            return;
        }

        confirmTarget.value = template;
    }

    /**
     * Closes the confirmation without deleting. It does not close while the deletion
     * itself is running: the dialog is what shows how that is going, and taken out from
     * under the hand it would leave the person without an outcome.
     */
    function closeDeleteConfirm(): void {
        if (isDeleting.value) {
            return;
        }

        confirmTarget.value = null;
    }

    /**
     * Deletes the template that has been confirmed.
     *
     * The row is taken out of the list by the answer of the endpoint rather than by
     * another read: a deletion leaves nothing about the record worth re-reading. Hitting
     * the ceiling of the wait is the exception: the outcome is unknown (the server may
     * have deleted the record and failed to answer in time), and then the list is
     * re-read so that the person sees what actually happened.
     */
    async function confirmDelete(): Promise<void> {
        const template = confirmTarget.value;

        if (!template || isDeleting.value) {
            return;
        }

        isDeleting.value = true;
        pendingTemplateId.value = template.id;

        try {
            await deleteTemplateRequest(template.id);
            removeTemplate(template.id);
            confirmTarget.value = null;
            options.onNotify(
                t('bricks.templates.toasts.deleted', { name: template.name }),
                'success'
            );
        } catch (error: unknown) {
            if (isRequestTimeoutError(error)) {
                confirmTarget.value = null;
                options.onNotify(t('bricks.templates.errors.deleteOutcomeUnknown'), 'error');
                await refreshTemplates();
                return;
            }

            options.onNotify(t(resolveTemplateActionErrorKey(error)), 'error');
        } finally {
            isDeleting.value = false;
            pendingTemplateId.value = null;
        }
    }
    // #endregion

    return {
        pendingTemplateId: computed(() => pendingTemplateId.value),
        isDeleteConfirmOpen,
        deleteConfirmDescription,
        isDeleting: computed(() => isDeleting.value),
        requestDelete,
        closeDeleteConfirm,
        confirmDelete,
    };
}
