// #region Imports
// Vitest
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Types
import type { IBricksPageRow } from '../../src/runtime/modules/common/types/bricks-api';

// Constants
import { PAGE_CODE_MAX_LENGTH } from '../../src/runtime/modules/common/constants/publish';
// #endregion

const { queryOneMock } = vi.hoisted(() => ({ queryOneMock: vi.fn() }));

vi.mock('../../src/runtime/modules/persistence/server/postgres/client', () => ({
    query: vi.fn(),
    queryOne: queryOneMock,
    withTransaction: vi.fn(),
}));

vi.mock('nitropack/runtime', () => ({
    useRuntimeConfig: () => ({}),
}));

import {
    validateCreatePagePayload,
    validateUpdatePagePayload,
} from '../../src/runtime/modules/persistence/server/utils/payloadValidation';
import {
    buildUpdateQuery,
    PAGE_SELECT_FIELDS,
    PAGE_SUMMARY_FIELDS,
    PAGE_UPDATE_FIELDS,
} from '../../src/runtime/modules/persistence/server/postgres/queryBuilders';
import { toPublicPageProjection } from '../../src/runtime/modules/persistence/server/utils/publicProjection';
import { createPostgresStorageAdapter } from '../../src/runtime/modules/persistence/server/postgres/postgresStorageAdapter';
import { createPageBuilder } from '../helpers/publishFixtures';

const HEAD_CODE = '<script>ym(1, "init");</script>';
const BODY_CODE = '<noscript><img src="https://mc.example.com/watch/1" alt=""></noscript>';

const buildPage = createPageBuilder();

/**
 * Minimal valid body of a page creation.
 *
 * @param overrides - Fields on top of the minimal body.
 * @returns The request body.
 */
function makeCreateBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return { pagename: 'landing', schema: { components: [] }, ...overrides };
}

describe('page code payload validation', () => {
    it('accepts both pieces of code and the noindex flag on create', () => {
        const result = validateCreatePagePayload(
            makeCreateBody({ headCode: HEAD_CODE, bodyEndCode: BODY_CODE, noindex: true })
        );

        expect(result.headCode).toBe(HEAD_CODE);
        expect(result.bodyEndCode).toBe(BODY_CODE);
        expect(result.noindex).toBe(true);
    });

    it('keeps the markup of the code as is: it is not sanitized', () => {
        const code = '<script src="https://cdn.example.com/w.js" async></script><div id="w"></div>';

        expect(validateCreatePagePayload(makeCreateBody({ headCode: code })).headCode).toBe(code);
    });

    it('stores blank code as no code', () => {
        const result = validateCreatePagePayload(
            makeCreateBody({ headCode: '  \n', bodyEndCode: null })
        );

        expect(result.headCode).toBeNull();
        expect(result.bodyEndCode).toBeNull();
    });

    it('rejects code over the length limit', () => {
        const tooLong = 'x'.repeat(PAGE_CODE_MAX_LENGTH + 1);

        expect(() => validateCreatePagePayload(makeCreateBody({ headCode: tooLong }))).toThrow(
            /headCode/
        );
        expect(() => validateCreatePagePayload(makeCreateBody({ bodyEndCode: tooLong }))).toThrow(
            /bodyEndCode/
        );
    });

    it('accepts code exactly at the length limit', () => {
        const atLimit = 'x'.repeat(PAGE_CODE_MAX_LENGTH);

        expect(
            validateCreatePagePayload(makeCreateBody({ bodyEndCode: atLimit })).bodyEndCode
        ).toBe(atLimit);
    });

    it('rejects values of the wrong type', () => {
        expect(() => validateCreatePagePayload(makeCreateBody({ headCode: 42 }))).toThrow(
            /headCode/
        );
        expect(() => validateCreatePagePayload(makeCreateBody({ noindex: 'yes' }))).toThrow(
            /noindex/
        );
    });

    it('takes the noindex flag alone as a valid partial update', () => {
        expect(validateUpdatePagePayload({ noindex: false })).toEqual({ noindex: false });
    });
});

describe('page code columns', () => {
    it('reads the code and the flag in both the full and the summary projection', () => {
        for (const fields of [PAGE_SELECT_FIELDS, PAGE_SUMMARY_FIELDS]) {
            expect(fields).toContain('head_code as "headCode"');
            expect(fields).toContain('body_end_code as "bodyEndCode"');
            expect(fields).toMatch(/\bnoindex\b/);
        }
    });

    it('writes the code and the flag into their snake_case columns on update', () => {
        const { updates, values } = buildUpdateQuery(
            { headCode: HEAD_CODE, bodyEndCode: null, noindex: true },
            PAGE_UPDATE_FIELDS
        );

        expect(updates).toEqual(['head_code = $1', 'body_end_code = $2', 'noindex = $3']);
        expect(values).toEqual([HEAD_CODE, null, true]);
    });
});

describe('page code on create in the Postgres adapter', () => {
    beforeEach(() => {
        queryOneMock.mockReset();
        queryOneMock.mockResolvedValue({ id: 1, pagename: 'landing', revision: 1 });
    });

    it('inserts the code and the flag that came with the payload', async () => {
        await createPostgresStorageAdapter().createPage({
            pagename: 'landing',
            schema: { components: [] },
            headCode: HEAD_CODE,
            bodyEndCode: BODY_CODE,
            noindex: true,
        });

        const [sql, values] = queryOneMock.mock.calls[0] as [string, unknown[]];
        expect(sql).toContain('head_code, body_end_code, noindex');
        expect(values.slice(-3)).toEqual([HEAD_CODE, BODY_CODE, true]);
    });

    it('creates a page without code and indexable when the payload is silent', async () => {
        await createPostgresStorageAdapter().createPage({
            pagename: 'landing',
            schema: { components: [] },
        });

        const [, values] = queryOneMock.mock.calls[0] as [string, unknown[]];
        expect(values.slice(-3)).toEqual([null, null, false]);
    });
});

describe('page code in the public projection', () => {
    it('carries the code and the flag: the live render needs them', () => {
        const row: IBricksPageRow = {
            ...buildPage({ headCode: HEAD_CODE, bodyEndCode: BODY_CODE, noindex: true }),
            schema: { components: [] },
            revision: 1,
        };

        const projection = toPublicPageProjection(row);

        expect(projection.headCode).toBe(HEAD_CODE);
        expect(projection.bodyEndCode).toBe(BODY_CODE);
        expect(projection.noindex).toBe(true);
    });
});
