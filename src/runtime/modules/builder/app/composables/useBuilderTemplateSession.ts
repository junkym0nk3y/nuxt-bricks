// #region Imports
// Types
import type { IBricksTemplatePageMeta, IBricksTemplateRow } from '../../../common/types/templates';
import type {
    IBuilderTemplateLoadedMeta,
    IBuilderTemplateSessionOptions,
    IUseBuilderTemplateSessionReturn,
} from '../types/composables';

// Utils
import { fetchTemplateRequest } from '../../templates/utils/templatesApi';
import { resolveTemplateLoadErrorKey } from '../../templates/utils/templateErrors';
import { isRequestTimeoutError } from '../../../common/utils/apiRequestPolicy';

// Vue
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';

// Pinia
import { useComponentsStore } from '../../core/stores/components';
import { usePublishStore } from '../../publish/stores/publish';
// #endregion

/**
 * The session of the editor of a template: reads the template by its id and lays it out
 * over the stores the editor works with — the schema onto the canvas, the styling into
 * the publish form (the layout, the background and the device set are read from there by
 * the canvas and the sidebar, the same as for a page).
 *
 * Unlike a page there are no drafts, no address and no list of pages: a template is
 * opened by its id alone, and unsaved edits live as long as the tab does — the minimal
 * scope the editor of templates was agreed with.
 *
 * @param options - The session token and the toast.
 * @returns The state of the session and the way to open or retry it.
 */
export function useBuilderTemplateSession(
    options: IBuilderTemplateSessionOptions
): IUseBuilderTemplateSessionReturn {
    const { sessionToken, showToast } = options;

    // #region Data
    const { t } = useI18n();
    const componentsStore = useComponentsStore();
    const publishStore = usePublishStore();

    // Loading from the very first frame: the loader is mounted with the page, and the
    // opening itself starts in its `onMounted`
    const isSessionLoading = ref(true);
    const isSessionReady = ref(false);
    const sessionError = ref<string | null>(null);
    const template = ref<IBricksTemplateRow | null>(null);
    const loadedPageMeta = ref<IBuilderTemplateLoadedMeta | null>(null);

    /** The template being opened: the retry opens the same one */
    let requestedTemplateId: number | null = null;
    // #endregion

    // #region Methods
    /**
     * Lays the styling of the template out over the publish form.
     *
     * The form starts from a new publication: the fields of a page (the address, the SEO
     * text, the publication flag) stay empty and are not shown in the editor of a
     * template, while an empty layout or background of the template turns into the
     * default the form shows for a page.
     *
     * @param pageMeta - The styling of the template.
     * @returns The styling as the form shows it.
     */
    function applyPageMeta(pageMeta: IBricksTemplatePageMeta): IBricksTemplatePageMeta {
        publishStore.startNewPublish();

        if (pageMeta.layout) {
            publishStore.setCurrentFormField('layout', pageMeta.layout);
        }

        if (pageMeta.backgroundColor) {
            publishStore.setCurrentFormField('backgroundColor', pageMeta.backgroundColor);
        }

        publishStore.setCurrentFormField('viewportConfig', pageMeta.viewportConfig);

        const { layout, backgroundColor, viewportConfig } = publishStore.currentFormState;

        return {
            layout: layout || null,
            backgroundColor: backgroundColor || null,
            viewportConfig: viewportConfig ?? null,
        };
    }

    /**
     * Reads the template and opens it in the editor.
     *
     * The canvas and the form are filled only by the current opening: an answer that
     * arrives after the next opening or after the page has been left is dropped, so a
     * slow read never lands over a newer state.
     *
     * @param templateId - The identifier of the template.
     */
    async function openTemplateSession(templateId: number): Promise<void> {
        sessionToken.invalidate();
        const generation = sessionToken.capture();

        requestedTemplateId = templateId;
        isSessionLoading.value = true;
        isSessionReady.value = false;
        sessionError.value = null;

        try {
            const row = await fetchTemplateRequest(templateId);

            if (!sessionToken.isCurrent(generation)) {
                return;
            }

            const shown = applyPageMeta(row.pageMeta);

            componentsStore.loadSchema(row.schema, { resetHistory: true });
            template.value = row;
            loadedPageMeta.value = { stored: row.pageMeta, shown };
            isSessionReady.value = true;
        } catch (error: unknown) {
            if (!sessionToken.isCurrent(generation)) {
                return;
            }

            const message = isRequestTimeoutError(error)
                ? t('bricks.templates.editor.errorTimeout')
                : t(resolveTemplateLoadErrorKey(error));

            sessionError.value = message;
            showToast(message, 'error');
        } finally {
            if (sessionToken.isCurrent(generation)) {
                isSessionLoading.value = false;
            }
        }
    }

    /**
     * Repeats the opening after a refusal — the "Retry" button of the blocking screen.
     */
    async function retryTemplateSession(): Promise<void> {
        if (requestedTemplateId === null) {
            return;
        }

        await openTemplateSession(requestedTemplateId);
    }
    // #endregion

    return {
        isSessionLoading,
        isSessionReady,
        sessionError,
        template,
        loadedPageMeta,
        openTemplateSession,
        retryTemplateSession,
    };
}
