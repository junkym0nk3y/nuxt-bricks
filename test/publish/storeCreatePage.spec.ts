// #region Imports
// Vitest
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Pinia
import { createPinia, setActivePinia } from 'pinia';

// Types
import type { TPublishFormState } from '../../src/runtime/modules/common/types/bricks-api';
import type { IBricksSchema } from '../../src/runtime/modules/common/types/brick';
// #endregion

const { apiFetcherMock } = vi.hoisted(() => ({ apiFetcherMock: vi.fn() }));

vi.mock('../../src/runtime/modules/common/composables/useApiClient', () => ({
    useApiClient: () => ({ apiFetcher: apiFetcherMock }),
}));

import { usePublishStore } from '../../src/runtime/modules/builder/publish/stores/publish';
import { usePublishPreview } from '../../src/runtime/modules/builder/publish/composables/usePublishPreview';

/**
 * Собирает состояние формы создания страницы с переопределениями.
 *
 * @param overrides - Переопределяемые поля.
 * @returns Полное состояние формы.
 */
function buildFormState(overrides: Partial<TPublishFormState> = {}): TPublishFormState {
    return {
        pagename: 'new-page',
        title: 'New page',
        description: 'Описание новой страницы',
        keywords: '',
        published: true,
        layout: 'default',
        backgroundColor: '#ffffff',
        socialImage: null,
        urlPrefix: null,
        subdomain: null,
        createdAt: '',
        updatedAt: '',
        ...overrides,
    };
}

describe('usePublishStore: создание страницы и URL превью', () => {
    beforeEach(() => {
        setActivePinia(createPinia());
        apiFetcherMock.mockReset();
        apiFetcherMock.mockImplementation(
            (_url: string, options?: { method?: string; body?: Record<string, unknown> }) => {
                if (options?.method === 'POST') {
                    return Promise.resolve({ id: 42, pagename: options.body?.pagename });
                }
                // GET /api/bricks/ после publishPage (loadAllPages)
                return Promise.resolve([]);
            }
        );
    });

    it('createPage создаёт черновик независимо от published в форме', async () => {
        const store = usePublishStore();

        const createdId = await store.createPage(
            { components: [] },
            buildFormState({ published: true })
        );

        expect(createdId).toBe(42);

        const postCall = apiFetcherMock.mock.calls.find(([, options]) => {
            return (options as { method?: string } | undefined)?.method === 'POST';
        });
        expect(postCall).toBeTruthy();

        const body = (postCall as unknown[])[1] as { body: Record<string, unknown> };
        expect(body.body.pagename).toBe('new-page');
        expect(body.body.published).toBe(false);
        expect(body.body.schema).toEqual({ components: [] });
    });

    it('createPage кладёт в POST переданную схему, а не пустой холст', async () => {
        const store = usePublishStore();
        const schema: IBricksSchema = {
            components: [
                {
                    id: 'grid-1',
                    type: 'layout',
                    componentName: 'grid',
                    brickPath: '/layouts/grid',
                    zIndex: 1,
                    props: {},
                    children: [],
                },
            ],
        };

        await store.createPage(schema, buildFormState());

        const postCall = apiFetcherMock.mock.calls.find(([, options]) => {
            return (options as { method?: string } | undefined)?.method === 'POST';
        });
        const body = (postCall as unknown[])[1] as { body: Record<string, unknown> };

        // Создание из JSON-файла — один POST со схемой, а не POST пустой страницы
        // плюс PATCH: второй запрос оставлял бы окно, в котором страница пустая
        expect(body.body.schema).toEqual(schema);
        expect(body.body.published).toBe(false);
    });

    it('generatePreviewUrl ведёт на превью-роут /preview/[pagename] без query', () => {
        const { generatePreviewUrl } = usePublishPreview();

        expect(generatePreviewUrl('landing')).toBe('/preview/landing');
        expect(generatePreviewUrl('landing')).not.toContain('?preview');
    });
});
