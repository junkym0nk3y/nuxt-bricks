// #region Imports
// Vitest
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Vue
import { computed, ref } from 'vue';

// Types
import type { IPublishedPage } from '../../src/runtime/modules/common/types/bricks-api';
import type { IBricksPageAddress } from '../../src/runtime/modules/common/types/pageAddress';
// #endregion

/**
 * Слот превью `bricks-preview-page` один на билдер, и владеет им последнее
 * открытое превью. Поэтому вкладка, закрываясь, сверяет адрес: иначе закрытие
 * давно открытой вкладки уносило бы снимок свежей — та после перезагрузки
 * осталась бы без состояния канваса (канал синка передаёт только схему,
 * накладывать её было бы не на что).
 */

// #region Mocks
vi.mock('../../src/runtime/modules/common/composables/useBricksConfig', () => ({
    useBricksConfig: () => ({ breakpoints: { mobile: 0, tablet: 768, desktop: 1280 } }),
}));
// #endregion

import { useRendererPreviewSync } from '../../src/runtime/modules/render/composables/useRendererPreviewSync';

const PREVIEW_SLOT_KEY = 'bricks-preview-page';

/**
 * Стаб localStorage поверх Map плюс `close` — больше `closePreview` ничего не
 * трогает.
 *
 * @returns Объект для `vi.stubGlobal('window', ...)`.
 */
function createPreviewWindowStub() {
    const data = new Map<string, string>();

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
        close: vi.fn(),
    };
}

/**
 * Снимок страницы в слоте превью.
 *
 * @param address - Адрес страницы, с которой снят снимок.
 * @returns Строка для localStorage.
 */
function buildSnapshot(address: IBricksPageAddress): string {
    return JSON.stringify({
        id: 1,
        pagename: address.pagename,
        urlPrefix: address.urlPrefix,
        title: 'Снимок канваса',
        schema: { components: [] },
        isPreview: true,
        storedAt: '2026-08-04T10:00:00.000Z',
    });
}

/**
 * Поднимает композабл превью для заданного адреса.
 *
 * @param address - Адрес вкладки превью.
 * @param previewVersionId - Id версии (null — превью текущего состояния).
 * @returns Возвращаемое значение композабла.
 */
function mountPreviewSync(address: IBricksPageAddress, previewVersionId: number | null = null) {
    const page = ref<IPublishedPage | null>(null);

    return useRendererPreviewSync({
        address,
        // Клиентские подписки не нужны: проверяется только владение слотом,
        // а `closePreview` отдаётся в любом режиме
        isPreview: false,
        previewVersionId,
        middlewarePageData: ref<IPublishedPage | null>(null),
        livePreviewData: page,
        page: computed(() => page.value),
        refreshDataSources: vi.fn(),
    });
}

describe('closePreview: владение единственным слотом превью', () => {
    let windowStub: ReturnType<typeof createPreviewWindowStub>;

    beforeEach(() => {
        windowStub = createPreviewWindowStub();
        vi.stubGlobal('window', windowStub);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('свой снимок уносит', () => {
        const blogPost = { pagename: 'post', urlPrefix: 'blog' };
        windowStub.localStorage.setItem(PREVIEW_SLOT_KEY, buildSnapshot(blogPost));

        mountPreviewSync(blogPost).closePreview();

        expect(windowStub.localStorage.getItem(PREVIEW_SLOT_KEY)).toBeNull();
        expect(windowStub.close).toHaveBeenCalled();
    });

    it('чужой снимок оставляет на месте', () => {
        const newsPost = { pagename: 'post', urlPrefix: 'news' };
        windowStub.localStorage.setItem(PREVIEW_SLOT_KEY, buildSnapshot(newsPost));

        // Вкладка `/blog/post` открыта раньше, слотом владеет `/news/post`:
        // унеси она снимок — свежее превью потеряло бы состояние канваса
        mountPreviewSync({ pagename: 'post', urlPrefix: 'blog' }).closePreview();

        expect(windowStub.localStorage.getItem(PREVIEW_SLOT_KEY)).toBe(buildSnapshot(newsPost));
        expect(windowStub.close).toHaveBeenCalled();
    });

    it('беспрефиксный адрес не считает своим снимок страницы с префиксом', () => {
        const blogPost = { pagename: 'post', urlPrefix: 'blog' };
        windowStub.localStorage.setItem(PREVIEW_SLOT_KEY, buildSnapshot(blogPost));

        mountPreviewSync({ pagename: 'post', urlPrefix: null }).closePreview();

        expect(windowStub.localStorage.getItem(PREVIEW_SLOT_KEY)).toBe(buildSnapshot(blogPost));
    });

    it('вкладка версии слот не трогает даже при совпадении адреса', () => {
        const blogPost = { pagename: 'post', urlPrefix: 'blog' };
        windowStub.localStorage.setItem(PREVIEW_SLOT_KEY, buildSnapshot(blogPost));

        // Снимок завела не она: её состояние приехало с сервера по `?version=`
        mountPreviewSync(blogPost, 44).closePreview();

        expect(windowStub.localStorage.getItem(PREVIEW_SLOT_KEY)).toBe(buildSnapshot(blogPost));
    });

    it('нечитаемую запись убирает: владельца у неё не определить', () => {
        windowStub.localStorage.setItem(PREVIEW_SLOT_KEY, '{ сломанный json');

        mountPreviewSync({ pagename: 'post', urlPrefix: 'blog' }).closePreview();

        expect(windowStub.localStorage.getItem(PREVIEW_SLOT_KEY)).toBeNull();
    });
});
