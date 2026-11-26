// #region Imports
// Types
import type { IBricksTemplatePageMeta } from '../../../common/types/templates';
import type {
    IBuilderTemplateWriteOptions,
    IUseBuilderTemplateWriteReturn,
} from '../types/composables';

// Utils
import {
    updateTemplateRequest,
    uploadTemplateThumbnailRequest,
} from '../../templates/utils/templatesApi';
import { resolveTemplateActionErrorKey } from '../../templates/utils/templateErrors';
import { toTemplateSummary } from '../../templates/utils/templateSummary';
import { isRequestTimeoutError } from '../../../common/utils/apiRequestPolicy';

// Vue
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';

// Composables
import { useCanvasSnapshot } from './useCanvasSnapshot';
import { useTemplatesData } from '../../templates/composables/useTemplatesData';

// Pinia
import { useComponentsStore } from '../../core/stores/components';
import { usePublishStore } from '../../publish/stores/publish';
// #endregion

/**
 * "Save template" of the editor of a template: writes the canvas and the styling over the
 * template, refreshes its card in the cache of the dashboard and then shoots a new
 * preview.
 *
 * The preview is best-effort and goes after the answer, as with a page: a failed shot
 * leaves the previous picture on the card, and the content is saved either way.
 *
 * @param options - The session, the open template and the toast.
 * @returns The state of the write and the save itself.
 */
export function useBuilderTemplateWrite(
    options: IBuilderTemplateWriteOptions
): IUseBuilderTemplateWriteReturn {
    const { sessionToken, isSessionReady, template, loadedPageMeta, showToast } = options;

    // #region Data
    const { t } = useI18n();
    const componentsStore = useComponentsStore();
    const publishStore = usePublishStore();
    const { upsertTemplate } = useTemplatesData();
    const { captureCanvasSnapshot } = useCanvasSnapshot(sessionToken);

    const isSaving = ref(false);
    // #endregion

    // #region Methods
    /**
     * Reads the styling out of the publish form.
     *
     * @returns The styling as the form holds it now.
     */
    function readShownPageMeta(): IBricksTemplatePageMeta {
        const { layout, backgroundColor, viewportConfig } = publishStore.currentFormState;

        return {
            layout: layout || null,
            backgroundColor: backgroundColor || null,
            viewportConfig: viewportConfig ?? null,
        };
    }

    /**
     * Assembles the styling to write. A layout or a background the person never touched
     * goes back as the template had it: an empty value of the template is shown as the
     * default of the form, and writing that default back would freeze "inherit" into a
     * fixed value nobody chose. The device set has no such substitution — `null` is both
     * the stored and the shown "inherit the project set".
     *
     * @param shown - The styling the form showed when the save was pressed.
     * @returns The styling of the template after the save.
     */
    function buildPageMeta(shown: IBricksTemplatePageMeta): IBricksTemplatePageMeta {
        const loaded = loadedPageMeta.value;

        if (!loaded) {
            return shown;
        }

        return {
            layout: shown.layout === loaded.shown.layout ? loaded.stored.layout : shown.layout,
            backgroundColor:
                shown.backgroundColor === loaded.shown.backgroundColor
                    ? loaded.stored.backgroundColor
                    : shown.backgroundColor,
            viewportConfig: shown.viewportConfig,
        };
    }

    /**
     * Shoots the canvas and uploads the frame as the preview of the template.
     *
     * @param templateId - The identifier of the saved template.
     * @param startedIn - The session token taken at the start of the save.
     */
    async function uploadPreview(templateId: number, startedIn: number): Promise<void> {
        try {
            const frame = await captureCanvasSnapshot(startedIn);

            if (!frame) {
                return;
            }

            const row = await uploadTemplateThumbnailRequest(templateId, frame);

            upsertTemplate(toTemplateSummary(row));

            if (sessionToken.isCurrent(startedIn)) {
                template.value = row;
            }
        } catch (error: unknown) {
            console.warn('[Bricks Template Thumbnail] Capture failed:', error);
        }
    }

    /**
     * Writes the canvas and the styling over the template.
     *
     * The card of the dashboard is refreshed whatever happened to the editor meanwhile:
     * the template is saved on the server, and the cache would otherwise show the
     * former picture and count of blocks until the next read. The editor's own state is
     * refreshed only by the session the save started in.
     */
    async function handleSaveTemplate(): Promise<void> {
        const current = template.value;

        if (!isSessionReady.value || !current) {
            showToast(t('bricks.templates.editor.saveBlocked'), 'error');
            return;
        }

        if (isSaving.value) {
            return;
        }

        const startedIn = sessionToken.capture();
        // Taken together with the payload, not after the answer: the settings stay
        // editable while the request is in flight, and a field changed meanwhile would
        // otherwise count as "untouched" on the next save and go back as stored — the
        // editor showing the new value while the template keeps the old one
        const sentShown = readShownPageMeta();

        isSaving.value = true;

        try {
            const saved = await updateTemplateRequest(current.id, {
                schema: componentsStore.exportSchema(),
                pageMeta: buildPageMeta(sentShown),
            });

            upsertTemplate(toTemplateSummary(saved));

            if (sessionToken.isCurrent(startedIn)) {
                template.value = saved;
                loadedPageMeta.value = { stored: saved.pageMeta, shown: sentShown };
            }

            showToast(t('bricks.templates.toasts.saved', { name: saved.name }), 'success');

            // Fire-and-forget, as with a page: the shot waits for the media of the
            // canvas, and the button must not hang on it
            uploadPreview(saved.id, startedIn);
        } catch (error: unknown) {
            showToast(
                t(
                    isRequestTimeoutError(error)
                        ? 'bricks.templates.editor.saveOutcomeUnknown'
                        : resolveTemplateActionErrorKey(error)
                ),
                'error'
            );
        } finally {
            isSaving.value = false;
        }
    }
    // #endregion

    return { isSaving, handleSaveTemplate };
}
