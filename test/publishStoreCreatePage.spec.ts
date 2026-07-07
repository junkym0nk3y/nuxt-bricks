// #region Imports
// Vitest
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Pinia
import { createPinia, setActivePinia } from 'pinia';

// Types
import type { TPublishFormState } from '../src/runtime/modules/common/types/bricks-api';
// #endregion

const { apiFetcherMock } = vi.hoisted(() => ({ apiFetcherMock: vi.fn() }));

vi.mock('../src/runtime/modules/common/composables/useApiClient', () => ({
    useApiClient: () => ({ apiFetcher: apiFetcherMock }),
}));

import { usePublishStore } from '../src/runtime/modules/builder/publish/stores/publish';
import { usePublishPreview } from '../src/runtime/modules/builder/publish/composables/usePublishPreview';

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

    it('createPage создаёт черновик с пустой схемой независимо от published в форме', async () => {
        const store = usePublishStore();

        const createdId = await store.createPage(buildFormState({ published: true }));

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

    it('generatePreviewUrl ведёт на превью-роут /preview/[pagename] без query', () => {
        const { generatePreviewUrl } = usePublishPreview();

        expect(generatePreviewUrl('landing')).toBe('/preview/landing');
        expect(generatePreviewUrl('landing')).not.toContain('?preview');
    });
});
