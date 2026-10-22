// #region Imports
// Types
import type { IBricksPageRow } from '../../src/runtime/modules/common/types/bricks-api';

// Vitest
import { describe, expect, it, vi } from 'vitest';

// Utils
import { withCheckedPagePath } from '../../src/runtime/modules/persistence/server/utils/pageAddressGuard';
import { DEFAULT_BRICKS_ROUTE_PREFIXES } from '../../src/runtime/modules/common/utils/bricks/routePaths';
import type { IPageAddressContext } from '../../src/runtime/modules/persistence/types/pageAddress';
// #endregion

/** Контекст адреса с дефолтными префиксами и включённым live-рендером. */
const CONTEXT: IPageAddressContext = {
    prefixes: DEFAULT_BRICKS_ROUTE_PREFIXES,
    isLiveSurfaceEnabled: true,
};

// #region Fakes
/** Сохранённая строка страницы: безопасный адрес `/landing`. */
function makeStoredPage(overrides: Partial<IBricksPageRow> = {}): IBricksPageRow {
    return {
        id: 1,
        pagename: 'landing',
        title: 'Landing',
        description: null,
        keywords: null,
        backgroundColor: null,
        layout: null,
        socialImage: null,
        urlPrefix: null,
        subdomain: null,
        thumbnailUrl: null,
        viewportConfig: null,
        schema: { components: [] },
        published: true,
        headCode: null,
        bodyEndCode: null,
        noindex: false,
        revision: 7,
        createdAt: '2026-08-01T00:00:00.000Z',
        updatedAt: '2026-08-01T00:00:00.000Z',
        ...overrides,
    };
}

/** Читающая часть адаптера со счётчиком обращений. */
function makeAdapter(page: IBricksPageRow | null = makeStoredPage()) {
    return { getPage: vi.fn(async () => page) };
}
// #endregion

describe('withCheckedPagePath: адрес страницы при частичном обновлении', () => {
    it('патч одного routing-поля берёт вторую половину пары и revision из строки', async () => {
        const adapter = makeAdapter();

        // Без precondition запись легла бы поверх состояния, изменившегося после
        // чтения, и пара могла собраться в запрещённый адрес незамеченной
        const payload = await withCheckedPagePath(adapter, 1, { urlPrefix: 'blog' }, CONTEXT);

        expect(payload.expectedRevision).toBe(7);
        expect(adapter.getPage).toHaveBeenCalledTimes(1);
    });

    it('своя revision вызывающего не подменяется', async () => {
        const payload = await withCheckedPagePath(
            makeAdapter(),
            1,
            { urlPrefix: 'blog', expectedRevision: 3 },
            CONTEXT
        );

        expect(payload.expectedRevision).toBe(3);
    });

    it('пара целиком в патче — сохранённая строка не читается', async () => {
        const adapter = makeAdapter();

        await withCheckedPagePath(adapter, 1, { urlPrefix: 'blog', pagename: 'landing' }, CONTEXT);

        expect(adapter.getPage).not.toHaveBeenCalled();
    });

    it('патч без routing-полей не читает строку и не получает precondition', async () => {
        const adapter = makeAdapter();

        const payload = await withCheckedPagePath(
            adapter,
            1,
            { schema: { components: [] } },
            CONTEXT
        );

        expect(adapter.getPage).not.toHaveBeenCalled();
        expect(payload.expectedRevision).toBeUndefined();
    });

    it('слитая пара с занятым адресом отклоняется', async () => {
        await expect(
            withCheckedPagePath(makeAdapter(), 1, { urlPrefix: 'bricks' }, CONTEXT)
        ).rejects.toThrow(/"\/bricks\/landing" is reserved/);
    });
});
