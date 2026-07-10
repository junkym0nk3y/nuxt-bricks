// #region Imports
// Vitest
import { describe, expect, it } from 'vitest';

// Utils
import {
    RequestError,
    isRevisionConflictError,
    toRequestError,
} from '../src/runtime/modules/builder/publish/utils/requestErrors';
// #endregion

/**
 * Ошибка в форме ofetch FetchError: h3 сериализует createError({ data })
 * в тело ответа, ofetch кладёт тело в `error.data`. Реальный message ofetch
 * содержит URL (в т.ч. «/api/»), поэтому toRequestError возвращает её как есть —
 * `withApiUrlInMessage: false` покрывает ветку с оборачиванием.
 */
function makeFetchError(
    statusCode: number,
    conflictCode?: string,
    withApiUrlInMessage = true
): Error {
    const message = withApiUrlInMessage ? `[PUT] "/api/bricks/9/": ${statusCode}` : 'Network fail';

    return Object.assign(new Error(message), {
        statusCode,
        data: {
            statusCode,
            statusMessage: 'Conflict',
            message: 'Conflict',
            ...(conflictCode ? { data: { code: conflictCode } } : {}),
        },
    });
}

describe('toRequestError: сохранение статуса и кода конфликта', () => {
    it('оборачивает ошибку без «/api/» в message в RequestError со статусом и кодом', () => {
        const error = toRequestError(
            'PUT',
            '/api/bricks/9',
            makeFetchError(409, 'REVISION_CONFLICT', false)
        );

        expect(error).toBeInstanceOf(RequestError);
        expect((error as RequestError).statusCode).toBe(409);
        expect((error as RequestError).conflictCode).toBe('REVISION_CONFLICT');
        expect(error.message).toContain('PUT /api/bricks/9');
    });

    it('isRevisionConflictError понимает сырую ofetch-ошибку (возвращена как есть)', () => {
        const raw = makeFetchError(409, 'REVISION_CONFLICT');
        const passedThrough = toRequestError('PUT', '/api/bricks/9', raw);

        // message содержит «/api/» — toRequestError сохранил старое поведение as-is
        expect(passedThrough).toBe(raw);
        expect(isRevisionConflictError(passedThrough)).toBe(true);
    });

    it('isRevisionConflictError различает конфликт revision и прочие ошибки', () => {
        const conflict = toRequestError(
            'PUT',
            '/api/bricks/9',
            makeFetchError(409, 'REVISION_CONFLICT', false)
        );
        const pagenameConflict = toRequestError(
            'PUT',
            '/api/bricks/9',
            makeFetchError(409, 'PAGENAME_CONFLICT', false)
        );
        const plain = toRequestError('PUT', '/api/bricks/9', makeFetchError(500, undefined, false));

        expect(isRevisionConflictError(conflict)).toBe(true);
        expect(isRevisionConflictError(pagenameConflict)).toBe(false);
        expect(isRevisionConflictError(plain)).toBe(false);
        expect(isRevisionConflictError(new Error('x'))).toBe(false);
    });

    it('не оборачивает повторно RequestError', () => {
        const original = toRequestError(
            'PUT',
            '/api/bricks/9',
            makeFetchError(409, 'REVISION_CONFLICT', false)
        );

        expect(toRequestError('PUT', '/api/bricks/9', original)).toBe(original);
        expect(isRevisionConflictError(toRequestError('PUT', '/api/bricks/9', original))).toBe(
            true
        );
    });
});
