// #region Imports
// Vitest
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Pinia
import { createPinia, setActivePinia } from 'pinia';

// Types
import type {
    IPreviewStoredPage,
    TPublishFormState,
} from '../../src/runtime/modules/common/types/bricks-api';
import type { IBricksSchema } from '../../src/runtime/modules/common/types/brick';
import type { IPreviewWindowStub } from '../helpers/types';
// #endregion

const { apiFetcherMock } = vi.hoisted(() => ({ apiFetcherMock: vi.fn() }));

vi.mock('../../src/runtime/modules/common/composables/useApiClient', () => ({
    useApiClient: () => ({ apiFetcher: apiFetcherMock }),
}));

import { usePublishStore } from '../../src/runtime/modules/builder/publish/stores/publish';
import { usePublishPreview } from '../../src/runtime/modules/builder/publish/composables/usePublishPreview';
import { createPreviewWindowStub } from '../helpers/publishFixtures';

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
        headCode: null,
        bodyEndCode: null,
        noindex: false,
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

describe('usePublishStore: создание страницы', () => {
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
});

/**
 * The address of a preview is checked by what actually travels into `window.open`:
 * the builder of the link is private, and the former check of a pure function did
 * not guard the main thing — that the caller sends the browser its result.
 */
describe('usePublishPreview: превью текущей страницы', () => {
    let windowStub: IPreviewWindowStub;

    beforeEach(() => {
        setActivePinia(createPinia());
        windowStub = createPreviewWindowStub();
        vi.stubGlobal('window', windowStub);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        // Restore rather than `useRealTimers`: the clock is replaced by a spy, which
        // the timers switch does not take off — the cases below would run with a
        // `Date.now` frozen for good
        vi.restoreAllMocks();
    });

    it('открывает превью-роут <previewPrefix>/<адрес> без query', () => {
        const store = usePublishStore();
        store.setCurrentFormState(buildFormState({ pagename: 'landing' }));

        expect(usePublishPreview().previewCurrentPage({ components: [] })).toEqual({
            pagename: 'landing',
            urlPrefix: null,
        });

        expect(windowStub.open).toHaveBeenCalledWith('/bricks-preview/landing', '_blank');
        expect(windowStub.open.mock.calls[0]?.[0]).not.toContain('?preview');
    });

    it('адрес превью полный: префикс страницы уезжает в ссылку', () => {
        const store = usePublishStore();
        store.setCurrentFormState(buildFormState({ pagename: 'post', urlPrefix: 'blog' }));

        // Otherwise the button of `/news/post` would open the tab of `/blog/post`
        usePublishPreview().previewCurrentPage({ components: [] });

        expect(windowStub.open).toHaveBeenCalledWith('/bricks-preview/blog/post', '_blank');
    });

    it('невалидный адрес формы даёт временный адрес и id снимка из одних часов', () => {
        const store = usePublishStore();
        store.setCurrentFormState(buildFormState({ pagename: 'Не адрес' }));
        // The clock moves between the calls: two readings would set the address of
        // the tab and the id of the snapshot a millisecond apart
        vi.spyOn(Date, 'now')
            .mockReturnValueOnce(1_700_000_000_000)
            .mockReturnValue(1_700_000_000_001);

        const address = usePublishPreview().previewCurrentPage({ components: [] });

        expect(address).toEqual({ pagename: 'preview-1700000000000', urlPrefix: null });
        expect(windowStub.open).toHaveBeenCalledWith(
            '/bricks-preview/preview-1700000000000',
            '_blank'
        );

        const stored = JSON.parse(
            windowStub.localStorage.getItem('bricks-preview-page') ?? '{}'
        ) as IPreviewStoredPage;

        expect(stored.id).toBe(1_700_000_000_000);
        expect(stored.pagename).toBe('preview-1700000000000');
    });

    it('заблокированный попап отказывает вызывающему, не пачкая ошибку формы', () => {
        const store = usePublishStore();
        store.setCurrentFormState(buildFormState({ pagename: 'landing' }));
        const preview = usePublishPreview();
        windowStub.open.mockReturnValueOnce(null);

        expect(preview.previewCurrentPage({ components: [] })).toBeNull();
        // The error is shown by the caller as a toast: a text put into the field of
        // the form would live in the publish panel until a write of the page and
        // would still hang there after a second attempt that did open
        expect(store.generalError).toBe('');
        // The snapshot stays: an already open preview tab reads it, and the next
        // attempt overwrites the slot anyway
        expect(windowStub.localStorage.getItem('bricks-preview-page')).not.toBeNull();

        expect(preview.previewCurrentPage({ components: [] })).not.toBeNull();
        expect(store.generalError).toBe('');
    });

    it('на сервере не трогает localStorage и не открывает вкладку', () => {
        const store = usePublishStore();
        store.setCurrentFormState(buildFormState({ pagename: 'landing' }));
        const preview = usePublishPreview();
        vi.stubGlobal('window', undefined);

        expect(preview.previewCurrentPage({ components: [] })).toBeNull();
        expect(windowStub.open).not.toHaveBeenCalled();
        expect(windowStub.localStorage.getItem('bricks-preview-page')).toBeNull();
    });
});
