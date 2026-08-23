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
        viewportConfig: null,
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
                // GET /api/bricks/ — на успешной публикации его быть не должно
                // (см. кейс ниже); мок держит ответ для остальных путей
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

    // Ответ POST — это вся созданная страница, и её кладёт в список
    // `syncPageInList`. Перечитывание сверху спрашивало у сервера то, что только
    // что приехало: страницы соседнего редактора подхватывает кнопка обновления в
    // дашборде, а не запрос на каждую публикацию
    it('успешная публикация списка не перечитывает', async () => {
        const store = usePublishStore();

        await store.publishPage({ components: [] }, buildFormState());

        const methods = apiFetcherMock.mock.calls.map(
            ([, options]) => (options as { method?: string } | undefined)?.method
        );

        expect(methods).toEqual(['POST']);
        expect(store.publishedPages.map((page) => page.id)).toEqual([42]);
    });

    // Обрыв по потолку ожидания — исход записи неизвестен, и этот GET единственный
    // способ увидеть, применил ли сервер создание. Ответа его при этом НЕ ждут:
    // сообщение об исходе обязано приехать сразу, а `await` держал бы поднятым общий
    // флаг записи — он блокирует сохранение в той сессии, куда человек успел уйти
    it('обрыв по потолку ожидания перечитывает список, но результата не ждёт', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => undefined);

        const store = usePublishStore();

        apiFetcherMock.mockImplementationOnce(() =>
            Promise.reject(Object.assign(new Error('timeout'), { name: 'TimeoutError' }))
        );

        // Присваивается синхронно в моке ниже — до первого использования
        let finishHungList!: (pages: unknown[]) => void;

        apiFetcherMock.mockImplementationOnce(
            () =>
                new Promise((resolve) => {
                    finishHungList = resolve;
                })
        );

        // Отказ создания приезжает, пока GET висит: с `await` внутри ветки обрыва
        // это ожидание не завершилось бы вовсе
        await expect(store.publishPage({ components: [] }, buildFormState())).rejects.toThrow();

        const listCalls = apiFetcherMock.mock.calls.filter(
            ([, options]) => (options as { method?: string } | undefined)?.method !== 'POST'
        );

        expect(listCalls).toHaveLength(1);

        finishHungList([]);
    });

    it('generatePreviewUrl ведёт на превью-роут <previewPrefix>/<адрес> без query', () => {
        const { generatePreviewUrl } = usePublishPreview();
        const landing = { pagename: 'landing', urlPrefix: null };

        expect(generatePreviewUrl(landing)).toBe('/bricks-preview/landing');
        expect(generatePreviewUrl(landing)).not.toContain('?preview');
        // Превью открывается из редактора конкретной страницы, поэтому его адрес
        // тоже полный: иначе кнопка у `/news/post` открывала бы вкладку `/blog/post`
        expect(generatePreviewUrl({ pagename: 'post', urlPrefix: 'blog' })).toBe(
            '/bricks-preview/blog/post'
        );
    });
});
