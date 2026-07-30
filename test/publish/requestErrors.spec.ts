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
import { isRequestTimeoutError } from '../../src/runtime/modules/common/utils/apiRequestPolicy';
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

describe('toPageWriteError: обновление списка перед показом конфликта', () => {
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

describe('toRequestError: обрыв по таймауту', () => {
    /**
     * Ошибка в форме ofetch при срабатывании потолка: исходный TimeoutError
     * лежит в `cause`, ответа нет, а message содержит URL — то есть подстроку
     * «/api/», на которой стоит ранний возврат «отдать как есть».
     */
    function makeTimeoutError(method: string): Error {
        const timeout = Object.assign(
            new Error('[TimeoutError]: The operation was aborted due to timeout'),
            { name: 'TimeoutError' }
        );

        return new Error(`[${method}] "/api/bricks/": <no response>`, { cause: timeout });
    }

    it('запись и чтение получают разный текст, а не транспортное сообщение', () => {
        // Ключи возвращаются как есть: вне Nuxt-контекста `translate` падает на них
        expect(toRequestError('PUT', '/api/bricks/9', makeTimeoutError('PUT')).message).toBe(
            'bricks.common.writeTimeout'
        );
        expect(toRequestError('GET', '/api/bricks/', makeTimeoutError('GET')).message).toBe(
            'bricks.common.readTimeout'
        );
    });

    it('обёртка сохраняет причину, поэтому таймаут остаётся распознаваемым', () => {
        const converted = toRequestError('POST', '/api/bricks', makeTimeoutError('POST'));

        // Без проброса cause вызывающие (стор, сессия) больше не отличили бы
        // неопределённый исход записи от отказа сервера
        expect(isRequestTimeoutError(converted)).toBe(true);
        expect(converted).toBeInstanceOf(RequestError);
        expect((converted as RequestError).statusCode).toBeUndefined();
    });

    it('обрыв тела с потерянной причиной доходит до текста и до сверки списка', async () => {
        // Нормализация транспорта возвращает такому обрыву имя `TimeoutError`,
        // причём без обёртки ofetch: чтение тела идёт вне её try/catch. Кейс
        // фиксирует, что продуктовые ветки — текст неизвестного исхода и сверка
        // списка — включаются именно на этой форме ошибки
        const normalized = Object.assign(
            new Error('The request was aborted after reaching the timeout', {
                cause: new DOMException('The user aborted a request.', 'AbortError'),
            }),
            { name: 'TimeoutError' }
        );
        const refresh = vi.fn(() => Promise.resolve());

        expect(toRequestError('PUT', '/api/bricks/9', normalized).message).toBe(
            'bricks.common.writeTimeout'
        );

        const settled = await toPageWriteError(normalized, refresh);

        expect(refresh).toHaveBeenCalledTimes(1);
        expect(isRequestTimeoutError(settled)).toBe(true);
    });

    it('toPageWriteError освежает список, но результата освежения не ждёт', async () => {
        // Освежение не отвечает и не падает; резолверы отпускаем в конце кейса,
        // чтобы не оставлять вечно ожидающий промис
        const refreshResolvers: Array<() => void> = [];
        const hangingRefresh = vi.fn(
            () =>
                new Promise<void>((resolve) => {
                    refreshResolvers.push(resolve);
                })
        );

        const settled = await Promise.race([
            toPageWriteError(makeTimeoutError('PUT'), hangingRefresh),
            Promise.resolve('не улажено'),
        ]);

        // Освежение запущено: по списку видно, применилась ли запись
        expect(hangingRefresh).toHaveBeenCalledTimes(1);
        // Но ожидание его результата отложило бы сообщение об исходе ещё на один
        // потолок чтения — при том что ответа по существу здесь и не требуется
        expect(settled).toBeInstanceOf(Error);
        expect(isRequestTimeoutError(settled)).toBe(true);

        refreshResolvers.splice(0).forEach((resolve) => resolve());
    });
});
