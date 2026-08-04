// #region Imports
// Vitest
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Pinia
import { createPinia, setActivePinia } from 'pinia';

// Types
import type { TPublishedPageSummary } from '../../src/runtime/modules/common/types/bricks-api';
import type { IPreviewWindowStub } from '../helpers/types';
// #endregion

/**
 * Превью сохранённой версии: версия уходит в URL, а не в localStorage. Слот
 * `bricks-preview-page` один и принадлежит превью канваса — билдер перезаписывает
 * его на каждую правку, поэтому снимок версии там не жил бы: открытая рядом
 * вкладка редактора показала бы вместо истории текущее состояние страницы.
 */

import { usePublishPreview } from '../../src/runtime/modules/builder/publish/composables/usePublishPreview';
import { normalizePageVersionPreview } from '../../src/runtime/modules/common/utils/bricks/publishedPage';
import { getRenderPageKey } from '../../src/runtime/modules/common/utils/bricks/previewRoute';
import { BRICKS_ROUTE_NAMES } from '../../src/runtime/modules/common/constants/routes';

const PAGE: TPublishedPageSummary = {
    id: 7,
    pagename: 'landing',
    title: 'Landing',
    description: null,
    keywords: null,
    backgroundColor: null,
    layout: 'default',
    socialImage: null,
    urlPrefix: null,
    subdomain: null,
    thumbnailUrl: null,
    published: true,
    revision: 3,
    createdAt: '2026-07-01T00:00:00Z',
    updatedAt: '2026-07-31T10:00:00Z',
};

/**
 * Стаб window: localStorage поверх Map и заглушка открытия вкладки. Открытая
 * вкладка изображается пустым объектом — код смотрит только на его наличие.
 *
 * @returns Объект для `vi.stubGlobal('window', ...)`.
 */
function createPreviewWindowStub(): IPreviewWindowStub {
    const data = new Map<string, string>();
    const openedTab = {} as Window;

    return {
        localStorage: {
            getItem: (key: string) => data.get(key) ?? null,
            setItem: (key: string, value: string) => {
                data.set(key, value);
            },
            removeItem: (key: string) => {
                data.delete(key);
            },
        },
        open: vi.fn(() => openedTab),
    };
}

describe('превью сохранённой версии', () => {
    let windowStub: IPreviewWindowStub;

    beforeEach(() => {
        setActivePinia(createPinia());
        windowStub = createPreviewWindowStub();
        vi.stubGlobal('window', windowStub);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('открывается с версией в URL и не занимает слот превью канваса', () => {
        const { previewPageVersion } = usePublishPreview();

        expect(previewPageVersion({ pagename: 'landing', urlPrefix: null }, 44)).toEqual({
            pagename: 'landing',
            urlPrefix: null,
        });

        expect(windowStub.open).toHaveBeenCalledWith(
            '/bricks-preview/landing?version=44',
            '_blank'
        );
        expect(windowStub.localStorage.getItem('bricks-preview-page')).toBeNull();
    });

    it('заблокированный попап сообщается вызывающему, а не теряется', () => {
        const { previewPageVersion } = usePublishPreview();
        windowStub.open.mockReturnValueOnce(null);

        expect(previewPageVersion({ pagename: 'landing', urlPrefix: null }, 44)).toBeNull();
    });

    it('снапшот версии рендерится под тождеством страницы и датой её сохранения', () => {
        const page = normalizePageVersionPreview(
            {
                id: 44,
                pageId: 7,
                // Страницу переименовали после снятия версии
                pagename: 'old-landing',
                title: 'Landing до правок',
                schema: { components: [{ id: 'a' }] },
                published: true,
                pageUpdatedAt: '2026-07-30T09:00:00Z',
                createdAt: '2026-07-31T10:00:00Z',
            },
            PAGE
        );

        // id и слаг — страницы: id версии открыл бы превью не той записи, а по
        // прежнему слагу превью-роут не совпал бы с URL вкладки
        expect(page.id).toBe(PAGE.id);
        expect(page.pagename).toBe(PAGE.pagename);
        // Дата — момент сохранения снятого состояния (ею подписана карточка версии),
        // а не момент снапшота, когда это состояние уже вытеснили
        expect(page.updatedAt).toBe('2026-07-30T09:00:00Z');
        // Писать из превью нечем: precondition чужой ревизией только мешал бы
        expect(page.revision).toBeUndefined();
        expect(page.schema.components).toHaveLength(1);
    });
});

/**
 * Собирает роут для page key: значимы только имя, путь и query.
 *
 * @param name - Имя роута.
 * @param path - Путь без query.
 * @param query - Query-параметры.
 * @returns Заготовка роута.
 */
function makeRoute(
    name: string,
    path: string,
    query: Record<string, string> = {}
): Parameters<typeof getRenderPageKey>[0] {
    return { name, path, query };
}

describe('page key страницы рендера', () => {
    it('превью: смена версии перемонтирует страницу', () => {
        const first = getRenderPageKey(
            makeRoute(BRICKS_ROUTE_NAMES.preview, '/preview/landing', { version: '44' })
        );
        const second = getRenderPageKey(
            makeRoute(BRICKS_ROUTE_NAMES.preview, '/preview/landing', { version: '45' })
        );

        // Id версии, ключ payload и режим синка снимаются один раз в setup:
        // при общем ключе переход оставил бы вкладку на прежнем состоянии
        expect(first).not.toBe(second);
    });

    it('превью: мусор в параметре версии равен её отсутствию', () => {
        const broken = getRenderPageKey(
            makeRoute(BRICKS_ROUTE_NAMES.preview, '/preview/landing', { version: 'abc' })
        );
        const live = getRenderPageKey(makeRoute(BRICKS_ROUTE_NAMES.preview, '/preview/landing'));

        expect(broken).toBe(live);
    });

    it('live-страница: `?version=` принадлежит потребителю и ключ не двигает', () => {
        const withParam = getRenderPageKey(
            makeRoute(BRICKS_ROUTE_NAMES.page, '/landing', { version: '2' })
        );
        const withoutParam = getRenderPageKey(makeRoute(BRICKS_ROUTE_NAMES.page, '/landing'));

        // Для рендера published-страницы параметр ничего не значит:
        // перемонтирование сбросило бы состояние и заново гоняло data sources
        expect(withParam).toBe(withoutParam);
    });
});
