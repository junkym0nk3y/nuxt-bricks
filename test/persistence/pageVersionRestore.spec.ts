// #region Imports
// Types
import type {
    IBricksPageRow,
    IPageVersion,
    IUpdatePagePayload,
} from '../../src/runtime/modules/common/types/bricks-api';
import type { IBricksComponent } from '../../src/runtime/modules/common/types/brick';

// Vitest
import { describe, expect, it } from 'vitest';

// Utils
import {
    restorePageVersion,
    type IPageVersionRestoreDeps,
} from '../../src/runtime/modules/persistence/server/utils/pageVersionRestore';
import { BricksRevisionConflictError } from '../../src/runtime/modules/persistence/server/utils/storageErrors';
// #endregion

// #region Fakes
/** Полный снапшот версии страницы для фейкового storage. */
function makeVersion(overrides: Partial<IPageVersion> = {}): IPageVersion {
    return {
        id: 5,
        pageId: 1,
        createdAt: '2026-07-01T00:00:00.000Z',
        pagename: 'landing',
        title: 'Landing',
        description: null,
        keywords: null,
        socialImage: null,
        layout: null,
        backgroundColor: '#ffffff',
        urlPrefix: null,
        subdomain: null,
        thumbnailUrl: 'https://storage.example.com/my-bucket/bricks-thumbnails/page-1-old.webp',
        schema: { components: [] },
        published: true,
        pageUpdatedAt: '2026-07-01T00:00:00.000Z',
        ...overrides,
    };
}

/** Строка страницы после успешного restore. */
function makePageRow(overrides: Partial<IBricksPageRow> = {}): IBricksPageRow {
    return {
        id: 1,
        pagename: 'landing',
        title: 'Landing',
        description: null,
        keywords: null,
        backgroundColor: '#ffffff',
        layout: null,
        socialImage: null,
        urlPrefix: null,
        subdomain: null,
        thumbnailUrl: null,
        schema: { components: [] },
        published: true,
        revision: 8,
        createdAt: '2026-06-01T00:00:00.000Z',
        updatedAt: '2026-07-11T00:00:00.000Z',
        ...overrides,
    };
}

/** Журналируемые фейки storage: каждый вызов пишется в calls. */
function makeDeps(overrides: {
    version?: IPageVersion | null;
    updateResult?: IBricksPageRow | null;
    updateError?: Error;
}): { deps: IPageVersionRestoreDeps; calls: string[] } {
    const calls: string[] = [];

    const deps: IPageVersionRestoreDeps = {
        storage: {
            async getPageVersion(pageId: number, versionId: number): Promise<IPageVersion | null> {
                calls.push(`getPageVersion:${pageId}:${versionId}`);
                return overrides.version === undefined ? makeVersion() : overrides.version;
            },
            async updatePage(
                id: number,
                payload: IUpdatePagePayload
            ): Promise<IBricksPageRow | null> {
                calls.push(`updatePage:${id}:${JSON.stringify(payload)}`);
                if (overrides.updateError) {
                    throw overrides.updateError;
                }
                return overrides.updateResult === undefined
                    ? makePageRow()
                    : overrides.updateResult;
            },
        },
    };

    return { deps, calls };
}
// #endregion

describe('restorePageVersion: version lookup + updatePage с revision-precondition', () => {
    it('версия не найдена (404) — updatePage не вызывается', async () => {
        const { deps, calls } = makeDeps({ version: null });

        await expect(restorePageVersion(deps, 1, 5, 8)).rejects.toMatchObject({
            statusCode: 404,
            statusMessage: 'Page version not found',
        });
        expect(calls).toEqual(['getPageVersion:1:5']);
    });

    it('актуальная revision: возвращает обновлённую страницу, передаёт schema/layout/backgroundColor/thumbnailUrl + expectedRevision', async () => {
        const { deps, calls } = makeDeps({});

        const result = await restorePageVersion(deps, 1, 5, 8);

        expect(result).toEqual(makePageRow());
        expect(calls).toEqual([
            'getPageVersion:1:5',
            `updatePage:1:${JSON.stringify({
                schema: makeVersion().schema,
                layout: makeVersion().layout,
                backgroundColor: makeVersion().backgroundColor,
                thumbnailUrl: makeVersion().thumbnailUrl,
                expectedRevision: 8,
            })}`,
        ]);
    });

    it('версия без снимка обнуляет превью страницы — прежний кадр показывал бы вытесненное содержимое', async () => {
        const { deps, calls } = makeDeps({ version: makeVersion({ thumbnailUrl: null }) });

        await restorePageVersion(deps, 1, 5, 8);

        expect(calls[1]).toContain('"thumbnailUrl":null');
    });

    it('updatePage вернул null (страница удалена между чтением версии и апдейтом) — 404', async () => {
        const { deps } = makeDeps({ updateResult: null });

        await expect(restorePageVersion(deps, 1, 5, 8)).rejects.toMatchObject({
            statusCode: 404,
            statusMessage: 'Page not found',
        });
    });

    it('stale revision: BricksRevisionConflictError из updatePage пробрасывается как есть', async () => {
        const { deps, calls } = makeDeps({ updateError: new BricksRevisionConflictError(1) });

        await expect(restorePageVersion(deps, 1, 5, 3)).rejects.toBeInstanceOf(
            BricksRevisionConflictError
        );
        // Ровно одна попытка апдейта — ничего лишнего не происходит после конфликта
        expect(calls).toEqual([
            'getPageVersion:1:5',
            `updatePage:1:${JSON.stringify({
                schema: makeVersion().schema,
                layout: makeVersion().layout,
                backgroundColor: makeVersion().backgroundColor,
                thumbnailUrl: makeVersion().thumbnailUrl,
                expectedRevision: 3,
            })}`,
        ]);
    });

    it('версия с невалидной схемой — 400, updatePage не вызывается', async () => {
        // Намеренно невалидная фикстура (повреждённая строка БД) — приводится из
        // unknown[], как в test/render/dataSourcesMalformedSchema.spec.ts (makePage).
        const invalidComponents: unknown[] = [null];

        const { deps, calls } = makeDeps({
            version: makeVersion({
                schema: { components: invalidComponents as IBricksComponent[] },
            }),
        });

        await expect(restorePageVersion(deps, 1, 5, 8)).rejects.toMatchObject({
            statusCode: 400,
        });
        expect(calls).toEqual(['getPageVersion:1:5']);
        expect(calls.some((call) => call.startsWith('updatePage'))).toBe(false);
    });
});
