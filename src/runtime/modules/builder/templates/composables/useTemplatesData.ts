// #region Imports
// Types
import type { TBricksTemplateSummary } from '../../../common/types/templates';
import type { ITemplatesState, IUseTemplatesDataReturn } from '../types/templates';

// Utils
import { fetchTemplatesRequest } from '../utils/templatesApi';
import { withPromiseDeadline } from '../../../common/utils/promiseDeadline';

// Vue
import { computed } from 'vue';

// Constants
import {
    BRICKS_API_READ_TIMEOUT_MS,
    BRICKS_SSR_DEADLINE_MARGIN_MS,
} from '../../../common/constants/apiTimeouts';

// Nuxt
import { useNuxtApp, useState } from '#imports';
// #endregion

// #region Data
/** The key of the shared template list state: one value per application */
const TEMPLATES_STATE_KEY = 'bricks-templates';

/**
 * The load in flight — per Nuxt application instance rather than in a module variable.
 *
 * On the server a module-global promise is shared by ALL requests of the process: two
 * simultaneous SSR renders of the dashboard would receive one and the same list, that
 * is, a response obtained under someone else's session. A `WeakMap` keyed by the
 * application instance isolates the deduplication per request and keeps no reference
 * once that request is over (the pattern of `useUsersData`).
 */
const inflightRequests = new WeakMap<object, Promise<void>>();

/**
 * The counter of local edits of the list — per application instance as well: `useState`
 * travels into the hydration payload, and a housekeeping counter has no place there.
 */
const localRevisions = new WeakMap<object, { count: number }>();
// #endregion

/**
 * The template list of the "Templates" section: reading it from the server and the
 * targeted edits of the state after an operation.
 *
 * The state is a `useState` rather than a Pinia store: the list lives on one surface
 * (the section of the dashboard and the picker of the source of a new page are that
 * same one), and what it does need is an SSR seed — the counter in the rail is drawn in
 * the very first frame together with the item of the section.
 *
 * The edits after an operation are targeted (`upsertTemplate`, `removeTemplate`)
 * instead of a re-read of the whole list: the endpoints hand back the full state of the
 * record, and a second GET for what has already arrived would only add a frame in which
 * the list managed to redraw twice. The full re-read stays with `refreshTemplates` — for
 * a retry after a refusal and for a check when the outcome of an operation is unknown.
 *
 * @returns The list, how it was read and the operations on the state.
 */
export function useTemplatesData(): IUseTemplatesDataReturn {
    // #region Data
    const nuxtApp = useNuxtApp();

    // Every transition writes the state as one object rather than editing it field by
    // field: an assignment then names the complete next state of the section, and no
    // half-written combination has to be reasoned about. Reactivity is not the reason to
    // do it this way — `useState` is a `toRef` onto a reactive payload, so a targeted
    // write notifies subscribers just as well
    const state = useState<ITemplatesState>(TEMPLATES_STATE_KEY, () => ({
        templates: [],
        status: 'idle',
    }));

    // Shared per application: the composable is called by the rail, by the section and
    // by the modals
    const revision = localRevisions.get(nuxtApp) ?? { count: 0 };

    localRevisions.set(nuxtApp, revision);
    // #endregion

    // #region Computed
    const templates = computed<TBricksTemplateSummary[]>(() => state.value.templates);
    const status = computed(() => state.value.status);

    const templatesCount = computed<number | null>(() =>
        state.value.status === 'ready' ? state.value.templates.length : null
    );

    /**
     * The date of the freshest template, for the summary line of the section. The first
     * element rather than a maximum: the server hands the list back by creation date
     * downwards, and a second pass over it would count the very same thing.
     */
    const lastSavedAt = computed<string | null>(() => state.value.templates[0]?.createdAt ?? null);
    // #endregion

    // #region Methods
    /**
     * Reads the list from the server and lays the outcome out over the state of the
     * section.
     *
     * A refusal is not thrown outwards: the read is started by the composition root
     * before the first frame, and a rejected promise would take the whole dashboard down
     * over a section the person may never have opened.
     */
    async function loadTemplates(): Promise<void> {
        // A list already read is not blanked out for the duration of the next read: the
        // cards on the screen are true as of the previous answer, and a skeleton in
        // their place on every entry into the section would take away what the person
        // came for
        if (state.value.status !== 'ready') {
            state.value = { ...state.value, status: 'loading' };
        }

        // A loop rather than a single request: an answer that a local edit has overtaken
        // must not be applied, yet the read must not be abandoned either — the section
        // would be left with a state nobody knows to be fresh or stale. An iteration
        // repeats exactly when an operation edited the list between the start of the
        // request and its answer, so it comes to a stop on its own (the pattern of
        // `useUsersData`)
        for (;;) {
            const revisionAtStart = revision.count;

            try {
                const list = await requestWithinDeadline();

                if (revision.count !== revisionAtStart) {
                    continue;
                }

                state.value = { templates: list, status: 'ready' };
            } catch (error: unknown) {
                // One state of refusal: the endpoints of the templates arrive
                // together with the module, so "the installation has no such
                // section" never happens here — every refusal is worth a retry
                state.value = { ...state.value, status: 'error' };

                console.error('[Builder] Failed to load templates list:', error);
            }

            return;
        }
    }

    /**
     * Bounds the wait for the list during SSR.
     *
     * The ceiling of the transport is inert on the server: a relative URL travels as an
     * internal call of Nitro, and that one does not listen to an `AbortSignal`. Without
     * an outer deadline a hung request would hold up not the list of templates but the
     * whole answer of the page.
     *
     * @returns The list of the summaries of the templates.
     */
    function requestWithinDeadline(): Promise<TBricksTemplateSummary[]> {
        const request = fetchTemplatesRequest();

        if (!import.meta.server) {
            return request;
        }

        const deadlineMs = BRICKS_API_READ_TIMEOUT_MS + BRICKS_SSR_DEADLINE_MARGIN_MS;

        return withPromiseDeadline(
            request,
            deadlineMs,
            () => new Error(`Templates list did not arrive within ${deadlineMs} ms`)
        );
    }

    /**
     * Hands back the read in flight, or starts a new one.
     *
     * The deduplication is there because of the second consumer of the list: the rail
     * with the counter, the section itself and the modal that creates a page all ask for
     * one state, and without a shared promise the first frame would send two identical
     * GETs.
     *
     * @returns The promise of the read in progress.
     */
    function startLoad(): Promise<void> {
        const inflight = inflightRequests.get(nuxtApp);

        if (inflight) {
            return inflight;
        }

        const request = loadTemplates().finally(() => {
            inflightRequests.delete(nuxtApp);
        });

        inflightRequests.set(nuxtApp, request);

        return request;
    }

    /**
     * Reads the list unless it has been read already.
     *
     * A list that is ready is not read again: the cards on the screen are true as of the
     * previous answer, and a read that was refused is retried by the button of the
     * section.
     */
    async function ensureTemplates(): Promise<void> {
        if (state.value.status === 'ready') {
            return;
        }

        return startLoad();
    }

    /**
     * Forces a re-read of the list: a retry after a temporary refusal, and a check after
     * an operation whose outcome is unknown.
     */
    async function refreshTemplates(): Promise<void> {
        return startLoad();
    }

    /**
     * Puts a template into the list: a known one in its place, a new one at the START.
     *
     * At the start rather than at the end (unlike the accounts): the server hands the
     * list back by creation date downwards, and a template just saved has to land where
     * it will land after the next read — otherwise its card would jump elsewhere on the
     * very first refresh.
     *
     * @param template - The summary of the template as received from the endpoint.
     */
    function upsertTemplate(template: TBricksTemplateSummary): void {
        const isKnown = state.value.templates.some((item) => item.id === template.id);

        revision.count += 1;

        state.value = {
            ...state.value,
            templates: isKnown
                ? state.value.templates.map((item) => (item.id === template.id ? template : item))
                : [template, ...state.value.templates],
        };
    }

    /**
     * Takes a template out of the list once its deletion has been confirmed.
     *
     * @param templateId - The identifier of the deleted template.
     */
    function removeTemplate(templateId: number): void {
        revision.count += 1;

        state.value = {
            ...state.value,
            templates: state.value.templates.filter((item) => item.id !== templateId),
        };
    }
    // #endregion

    return {
        templates,
        status,
        templatesCount,
        lastSavedAt,
        ensureTemplates,
        refreshTemplates,
        upsertTemplate,
        removeTemplate,
    };
}
