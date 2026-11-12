/**
 * The publication switch of the publish settings in the editor.
 *
 * What is guarded here:
 *
 * 1. Two places hold the flag — the row of the list and the publish form — and the
 *    switch brings both to the server state. A form without the new flag would bring
 *    the former one back with the next "Save" (a save sends `published` out of the
 *    form).
 * 2. The switch never runs next to a save: a PUT in flight carries the former flag and
 *    would take the publication back, so the switch claims the write registry of the
 *    current page and sends nothing while it is taken.
 * 3. A rollback after a refusal writes into the session the toggle started in only,
 *    and a refusal arriving over another page names the page it is about.
 * 4. The form follows the server flag of the row: after a PATCH aborted by the
 *    timeout the outcome is unknown, and the re-read of the list is what tells it.
 * 5. The drafts take no part in the flag: it is never an unsaved edit, so a draft that
 *    differs from the saved page by the flag alone is no draft at all, and a restored
 *    draft keeps the flag of the form.
 * 6. A failed save brings the form back to the flag of the server rather than to the one
 *    from before the request: a conflict re-reads the list first, and the stale value
 *    would publish again a page somebody else has taken down.
 */

// #region Imports
// Vitest
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Vue
import { computed, nextTick, ref } from 'vue';

// Pinia
import { createPinia, setActivePinia } from 'pinia';

// Types
import type { IBuilderSessionToken } from '../../src/runtime/modules/builder/app/types/session';
import type { IBuilderDraftSnapshot } from '../../src/runtime/modules/builder/publish/types/builderDrafts';

// Utils
import { buildEditFormState } from '../../src/runtime/modules/builder/publish/utils/formState';
import { isSnapshotEqual } from '../../src/runtime/modules/builder/publish/utils/draftSnapshots';
import {
    createPageBuilder,
    makeConflictFetchError,
    seedLoadedPages,
} from '../helpers/publishFixtures';
// #endregion

// #region Mocks
const { apiFetcherMock, builderToastMock } = vi.hoisted(() => ({
    apiFetcherMock: vi.fn(),
    builderToastMock: vi.fn(),
}));

vi.mock('../../src/runtime/modules/common/composables/useApiClient', () => ({
    useApiClient: () => ({ apiFetcher: apiFetcherMock }),
}));

vi.mock('vue-i18n', () => ({
    useI18n: () => ({
        t: (key: string, params?: Record<string, unknown>) =>
            key === 'bricks.publish.toasts.forPage' && params
                ? `${String(params.page)}: ${String(params.message)}`
                : key,
    }),
}));
vi.mock('../../src/runtime/modules/builder/core/composables/useBuilderToast', () => ({
    useBuilderToast: () => ({ showToast: builderToastMock }),
}));

vi.mock('../../src/runtime/modules/builder/app/composables/usePageThumbnail', () => ({
    usePageThumbnail: () => ({ captureAndUploadThumbnail: vi.fn() }),
}));
// #endregion

import { useBuilderPageWrite } from '../../src/runtime/modules/builder/app/composables/useBuilderPageWrite';
import { useBuilderPublishToggle } from '../../src/runtime/modules/builder/app/composables/useBuilderPublishToggle';
import { useBuilderSessionSnapshot } from '../../src/runtime/modules/builder/app/composables/useBuilderSessionSnapshot';
import { usePublishStore } from '../../src/runtime/modules/builder/publish/stores/publish';

const buildPage = createPageBuilder({ published: false });

/**
 * A session token with a manual move onto another page.
 *
 * @returns The token and the "open another page" function.
 */
function createSessionToken(): { token: IBuilderSessionToken; moveToAnotherPage: () => void } {
    let current = 1;

    return {
        token: {
            token: computed(() => current),
            capture: () => current,
            isCurrent: (captured: number) => captured === current,
            invalidate: () => {
                current += 1;
            },
        },
        moveToAnotherPage: () => {
            current += 1;
        },
    };
}

/**
 * Opens a page in the editor: the list and the form, as the opening of a session leaves
 * them.
 *
 * @param published - The publication flag of the page on the server.
 * @returns The publish store.
 */
function openPage(published: boolean): ReturnType<typeof usePublishStore> {
    const store = usePublishStore();

    seedLoadedPages(store, [
        buildPage({
            id: 7,
            title: 'Promo',
            description: 'The spring promo of the company',
            published,
            revision: 1,
        }),
    ]);
    store.startEditingPage(7);

    return store;
}

describe('useBuilderPublishToggle: the publication switch of the editor', () => {
    beforeEach(() => {
        setActivePinia(createPinia());
        apiFetcherMock.mockReset();
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
    });

    it('writes the flag to the server and brings the list and the form to it', async () => {
        const store = openPage(false);
        const { token } = createSessionToken();

        apiFetcherMock.mockResolvedValueOnce(buildPage({ id: 7, published: true, revision: 2 }));

        const { handleTogglePublished } = useBuilderPublishToggle({
            sessionToken: token,
            showToast: vi.fn(),
        });

        await handleTogglePublished(true);

        expect(apiFetcherMock).toHaveBeenCalledTimes(1);
        expect(apiFetcherMock.mock.calls[0][1]).toMatchObject({
            method: 'PATCH',
            body: { published: true },
        });
        expect(store.currentFormState.published).toBe(true);
        // The next save goes out with the fresh revision rather than the one before the PATCH
        expect(store.getPageById(7)?.revision).toBe(2);
        expect(store.isSubmitting).toBe(false);
    });

    it('brings the previous flag back into the form on a refusal', async () => {
        const store = openPage(true);
        const { token } = createSessionToken();
        const showToast = vi.fn();

        apiFetcherMock.mockRejectedValueOnce(new Error('503'));

        const { handleTogglePublished } = useBuilderPublishToggle({
            sessionToken: token,
            showToast,
        });

        await handleTogglePublished(false);

        expect(store.currentFormState.published).toBe(true);
        expect(store.isSubmitting).toBe(false);
        expect(showToast).toHaveBeenCalledWith(expect.stringContaining('503'), 'error');
    });

    it('follows the server flag when a re-read of the list shows the refused write applied', async () => {
        const store = openPage(false);
        const { token } = createSessionToken();

        apiFetcherMock.mockRejectedValueOnce(new Error('timeout'));

        const { handleTogglePublished } = useBuilderPublishToggle({
            sessionToken: token,
            showToast: vi.fn(),
        });

        await handleTogglePublished(true);

        expect(store.currentFormState.published).toBe(false);

        // The server did apply the PATCH: the re-read of the list brings the new flag
        store.syncPageInList(buildPage({ id: 7, published: true, revision: 2 }));
        await nextTick();

        expect(store.currentFormState.published).toBe(true);
    });

    it('sends nothing while a save of the page is running', async () => {
        const store = openPage(false);
        const { token } = createSessionToken();
        const saveWriteId = store.beginWrite();

        const { handleTogglePublished } = useBuilderPublishToggle({
            sessionToken: token,
            showToast: vi.fn(),
        });

        await handleTogglePublished(true);

        expect(apiFetcherMock).not.toHaveBeenCalled();
        expect(store.currentFormState.published).toBe(false);

        store.endWrite(saveWriteId as number);
    });

    it('sends nothing for a page that has never been saved', async () => {
        const store = usePublishStore();
        const { token } = createSessionToken();

        store.startNewPublish();

        const { handleTogglePublished } = useBuilderPublishToggle({
            sessionToken: token,
            showToast: vi.fn(),
        });

        await handleTogglePublished(true);

        expect(apiFetcherMock).not.toHaveBeenCalled();
        expect(store.currentFormState.published).toBe(false);
    });

    it('leaves the form of another page alone when the refusal arrives after a move', async () => {
        const store = openPage(false);
        const { token, moveToAnotherPage } = createSessionToken();
        const showToast = vi.fn();

        // Assigned synchronously in the mock below, before the first use
        let failPatch!: (error: Error) => void;

        apiFetcherMock.mockImplementationOnce(
            () =>
                new Promise((_, reject) => {
                    failPatch = reject;
                })
        );

        const { handleTogglePublished } = useBuilderPublishToggle({
            sessionToken: token,
            showToast,
        });

        const pending = handleTogglePublished(true);

        // The person has opened another page, whose form is published already
        moveToAnotherPage();
        store.setCurrentFormField('title', 'Another page');
        store.setCurrentFormField('published', true);

        failPatch(new Error('503'));
        await pending;

        expect(store.currentFormState.published).toBe(true);
        // The refusal is about the page the toggle started on, not the one on the screen
        expect(showToast).toHaveBeenCalledWith(expect.stringMatching(/^Promo: .*503/), 'error');
    });

    it('keeps the flag of the form when a draft carrying a stale flag is restored', async () => {
        const store = openPage(false);
        const { token } = createSessionToken();
        const draftFormState = { ...store.currentFormState, title: 'Edited title' };

        apiFetcherMock.mockResolvedValueOnce(buildPage({ id: 7, published: true, revision: 2 }));

        const { handleTogglePublished } = useBuilderPublishToggle({
            sessionToken: token,
            showToast: vi.fn(),
        });
        const { applySnapshot } = useBuilderSessionSnapshot({
            sessionAddress: ref({ pagename: 'page', urlPrefix: null }),
            renameSession: vi.fn(),
            sessionToken: token,
            draftStorageNotice: { report: vi.fn(), stop: vi.fn() },
            draftPrincipal: null,
        });

        await handleTogglePublished(true);

        // The draft was written before the switch, with the page still a draft
        applySnapshot({ schema: { components: [] }, formState: draftFormState });

        expect(store.currentFormState.title).toBe('Edited title');
        expect(store.currentFormState.published).toBe(true);
    });

    it('takes a draft that differs from the saved page by the flag alone for no draft', () => {
        const saved: IBuilderDraftSnapshot = {
            schema: { components: [] },
            formState: buildEditFormState(buildPage({ id: 7, published: true })),
        };
        const staleDraft: IBuilderDraftSnapshot = {
            schema: { components: [] },
            formState: { ...saved.formState, published: false },
        };

        expect(isSnapshotEqual(staleDraft, saved)).toBe(true);
        expect(
            isSnapshotEqual(
                { ...staleDraft, formState: { ...staleDraft.formState, title: 'Edited' } },
                saved
            )
        ).toBe(false);
    });

    it('keeps the server flag after a failed save, when the conflict re-read brought it', async () => {
        const store = openPage(true);
        const { token } = createSessionToken();

        // Somebody else has taken the page down: the save runs into the revision
        // conflict, and the re-read of the list brings the page unpublished
        apiFetcherMock.mockImplementation((_url: string, options?: { method?: string }) => {
            if (options?.method === 'PUT') {
                return Promise.reject(makeConflictFetchError());
            }

            return Promise.resolve([
                buildPage({ id: 7, title: 'Promo', published: false, revision: 2 }),
            ]);
        });

        useBuilderPublishToggle({ sessionToken: token, showToast: vi.fn() });
        const { handleSaveDraft } = useBuilderPageWrite({
            sessionToken: token,
            renameSession: vi.fn(),
            switchToSavedPage: vi.fn(),
            commitSavedSnapshot: vi.fn(),
            ensurePublishSettingsVisible: vi.fn(),
        });

        await handleSaveDraft();
        await nextTick();

        expect(builderToastMock).toHaveBeenCalledWith(expect.any(String), 'error');
        expect(store.getPageById(7)?.published).toBe(false);
        expect(store.currentFormState.published).toBe(false);
    });
});
