/**
 * The editor of a template: opening a template onto the canvas and into the publish form,
 * and "Save template".
 *
 * What is guarded here:
 *
 * 1. An empty layout or background of the template is shown as the default of the form;
 *    saved untouched, it goes back empty rather than frozen into that default, while a
 *    field the person changed goes back as chosen.
 * 2. A field changed while a save is in flight is not taken for untouched by the next
 *    save: the settings are not locked during the request.
 * 3. The preview is uploaded after the content and lands on the card of the dashboard
 *    cache — the section shows the new frame without a re-read.
 * 4. A slow read of a template that was left for another one never lands on the canvas.
 */

// #region Imports
// Vitest
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Vue
import { computed } from 'vue';

// Pinia
import { createPinia, setActivePinia } from 'pinia';

// Types
import type { IBricksTemplateRow } from '../../src/runtime/modules/common/types/templates';
import type { IBuilderSessionToken } from '../../src/runtime/modules/builder/app/types/session';

// Stubs
import { resetNuxtStateStub } from '../stubs/nuxt-imports';
// #endregion

// #region Mocks
const { apiFetcherMock, toastMock, captureMock } = vi.hoisted(() => ({
    apiFetcherMock: vi.fn(),
    toastMock: vi.fn(),
    captureMock: vi.fn(),
}));

vi.mock('../../src/runtime/modules/common/composables/useApiClient', () => ({
    useApiClient: () => ({ apiFetcher: apiFetcherMock }),
}));

vi.mock('vue-i18n', () => ({
    useI18n: () => ({ t: (key: string) => key }),
}));

vi.mock('../../src/runtime/modules/builder/app/composables/useCanvasSnapshot', () => ({
    useCanvasSnapshot: () => ({ captureCanvasSnapshot: captureMock }),
}));
// #endregion

import { useBuilderTemplateSession } from '../../src/runtime/modules/builder/app/composables/useBuilderTemplateSession';
import { useBuilderTemplateWrite } from '../../src/runtime/modules/builder/app/composables/useBuilderTemplateWrite';
import { useTemplatesData } from '../../src/runtime/modules/builder/templates/composables/useTemplatesData';
import { useComponentsStore } from '../../src/runtime/modules/builder/core/stores/components';
import { usePublishStore } from '../../src/runtime/modules/builder/publish/stores/publish';

// #region Fixtures
/**
 * A template row as the endpoint returns it.
 *
 * @param overrides - The fields that differ from the base.
 * @returns The row.
 */
function makeTemplate(overrides: Partial<IBricksTemplateRow> = {}): IBricksTemplateRow {
    return {
        id: 5,
        name: 'Landing',
        description: null,
        thumbnailUrl: null,
        schema: {
            components: [
                {
                    id: 'text-1',
                    type: 'component',
                    componentName: 'Text',
                    brickPath: 'content/text',
                    zIndex: 1,
                    props: { content: 'hi' },
                },
            ],
        },
        pageMeta: { layout: null, backgroundColor: null, viewportConfig: null },
        createdAt: '2026-11-20T00:00:00.000Z',
        updatedAt: '2026-11-20T00:00:00.000Z',
        ...overrides,
    } as IBricksTemplateRow;
}

/**
 * A real session token (the same counter `useBuilderSessionToken` keeps).
 *
 * @returns The token.
 */
function createSessionToken(): IBuilderSessionToken {
    let current = 0;

    return {
        token: computed(() => current),
        capture: () => current,
        isCurrent: (captured: number) => captured === current,
        invalidate: () => {
            current += 1;
        },
    };
}

/**
 * The editor of a template as its root page wires it.
 *
 * @returns The session and the write.
 */
function createEditor(): {
    session: ReturnType<typeof useBuilderTemplateSession>;
    write: ReturnType<typeof useBuilderTemplateWrite>;
} {
    const sessionToken = createSessionToken();
    const session = useBuilderTemplateSession({ sessionToken, showToast: toastMock });
    const write = useBuilderTemplateWrite({
        sessionToken,
        isSessionReady: session.isSessionReady,
        template: session.template,
        loadedPageMeta: session.loadedPageMeta,
        showToast: toastMock,
    });

    return { session, write };
}
// #endregion

beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    resetNuxtStateStub();
    captureMock.mockResolvedValue(null);
});

describe('the editor of a template', () => {
    it('writes an untouched empty layout back empty and a changed background as chosen', async () => {
        apiFetcherMock.mockImplementation((_url: string, options?: { body?: unknown }) =>
            Promise.resolve(
                options?.body
                    ? makeTemplate({ updatedAt: '2026-11-26T00:00:00.000Z' })
                    : makeTemplate()
            )
        );
        const { session, write } = createEditor();
        const publishStore = usePublishStore();

        await session.openTemplateSession(5);

        // The form shows a layout even though the template has none
        expect(publishStore.currentFormState.layout).toBeTruthy();
        expect(
            useComponentsStore()
                .exportSchema()
                .components.map((item) => item.id)
        ).toEqual(['text-1']);

        publishStore.setCurrentFormField('backgroundColor', '#112233');
        await write.handleSaveTemplate();

        const [url, request] = apiFetcherMock.mock.calls[1];

        expect(url).toBe('/api/bricks/templates/5');
        expect(request.method).toBe('PATCH');
        expect(request.body.pageMeta).toEqual({
            layout: null,
            backgroundColor: '#112233',
            viewportConfig: null,
        });
        expect(request.body.schema.components.map((item: { id: string }) => item.id)).toEqual([
            'text-1',
        ]);
    });

    it('writes a background changed while the previous save was in flight', async () => {
        let resolveFirstSave: (row: IBricksTemplateRow) => void = () => undefined;

        apiFetcherMock
            .mockImplementationOnce(() => Promise.resolve(makeTemplate()))
            .mockImplementationOnce(
                () =>
                    new Promise<IBricksTemplateRow>((resolve) => {
                        resolveFirstSave = resolve;
                    })
            )
            .mockImplementation(() => Promise.resolve(makeTemplate()));
        const { session, write } = createEditor();
        const publishStore = usePublishStore();

        await session.openTemplateSession(5);

        const firstSave = write.handleSaveTemplate();

        // The settings stay editable while the request is in flight
        publishStore.setCurrentFormField('backgroundColor', '#ff0000');
        resolveFirstSave(makeTemplate());
        await firstSave;
        await write.handleSaveTemplate();

        const [, request] = apiFetcherMock.mock.calls[2];

        expect(request.body.pageMeta.backgroundColor).toBe('#ff0000');
    });

    it('puts the new preview on the card of the dashboard after the content is saved', async () => {
        const frame = new Blob(['frame'], { type: 'image/jpeg' });
        const previewUrl = 'https://s3.example/bucket/bricks-thumbnails/template-new.webp';

        captureMock.mockResolvedValue(frame);
        apiFetcherMock.mockImplementation((url: string) =>
            Promise.resolve(
                url.endsWith('/thumbnail')
                    ? makeTemplate({ thumbnailUrl: previewUrl })
                    : makeTemplate()
            )
        );
        const { session, write } = createEditor();

        await session.openTemplateSession(5);
        await write.handleSaveTemplate();
        await vi.waitFor(() => expect(apiFetcherMock).toHaveBeenCalledTimes(3));

        const [url, request] = apiFetcherMock.mock.calls[2];

        expect(url).toBe('/api/bricks/templates/5/thumbnail');
        expect((request.body as FormData).get('file')).toBeInstanceOf(Blob);
        await vi.waitFor(() =>
            expect(useTemplatesData().templates.value).toEqual([
                expect.objectContaining({ id: 5, thumbnailUrl: previewUrl, blocksCount: 1 }),
            ])
        );
    });

    it('drops a template read that was overtaken by the next opening', async () => {
        let resolveFirst: (row: IBricksTemplateRow) => void = () => undefined;

        apiFetcherMock
            .mockImplementationOnce(
                () =>
                    new Promise<IBricksTemplateRow>((resolve) => {
                        resolveFirst = resolve;
                    })
            )
            .mockImplementationOnce(() =>
                Promise.resolve(makeTemplate({ id: 6, name: 'Promo', schema: { components: [] } }))
            );
        const { session } = createEditor();

        const first = session.openTemplateSession(5);
        await session.openTemplateSession(6);
        resolveFirst(makeTemplate());
        await first;

        expect(session.template.value?.id).toBe(6);
        expect(useComponentsStore().exportSchema().components).toEqual([]);
    });
});
