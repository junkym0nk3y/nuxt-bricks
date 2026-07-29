// #region Imports
// Vitest
import { afterEach, describe, expect, it, vi } from 'vitest';

// Utils
import {
    RequestError,
    isRevisionConflictError,
    requirePageRevision,
    toPageWriteError,
    toRequestError,
} from '../../src/runtime/modules/builder/publish/utils/requestErrors';
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

describe('requirePageRevision: precondition отката версии', () => {
    it('возвращает revision, если страница найдена и revision задан', () => {
        expect(requirePageRevision({ revision: 4 }, 'fallback')).toBe(4);
    });

    it('бросает fallback-сообщение, если страница не найдена', () => {
        expect(() => requirePageRevision(undefined, 'restore failed')).toThrow('restore failed');
    });

    it('бросает fallback-сообщение, если у найденной страницы нет revision', () => {
        expect(() => requirePageRevision({ revision: undefined }, 'restore failed')).toThrow(
            'restore failed'
        );
    });
});

describe('toPageWriteError: обновление списка перед показом конфликта (BM-26)', () => {
    // Резолверы «зависших» запросов: отпускаем их в afterEach, чтобы кейс не
    // оставлял после себя вечно ожидающий промис
    const hungResolvers: Array<() => void> = [];

    /**
     * Имитирует неотвечающий запрос: промис не завершается до конца кейса.
     */
    function hangingRequest(): Promise<void> {
        return new Promise<void>((resolve) => {
            hungResolvers.push(resolve);
        });
    }

    afterEach(() => {
        vi.useRealTimers();
        hungResolvers.splice(0).forEach((resolve) => resolve());
    });

    it('зависшее обновление не удерживает конфликт дольше дедлайна', async () => {
        vi.useFakeTimers();

        // Обновление списка не отвечает и не падает. Без дедлайна `toPageWriteError`
        // не вернулся бы вовсе, а вместе с ним не отработал бы `finally`, снимающий
        // общий `isSubmitting` — тулбар остался бы заблокирован и в той сессии, куда
        // пользователь успел уйти
        const conversion = toPageWriteError(
            new RequestError('conflict', 409, 'REVISION_CONFLICT'),
            hangingRequest
        );

        await vi.runAllTimersAsync();

        // Промис уже улажен — race с готовым значением отдаёт именно его
        const settled = await Promise.race([conversion, Promise.resolve(null)]);

        expect(settled).toBeInstanceOf(Error);
        expect((settled as Error).message).toBe('bricks.publish.toasts.revisionConflict');
    });
});
