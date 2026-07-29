// #region Imports
// Vitest
import { afterEach, describe, expect, it, vi } from 'vitest';

// ofetch
import { createFetch } from 'ofetch';

// Types
import type { IApiRequestTimeoutTarget } from '../../src/runtime/modules/common/types/apiRequest';

// Composables
import { useApiClient } from '../../src/runtime/modules/common/composables/useApiClient';

// Utils
import {
    applyApiRequestTimeout,
    isApiWriteMethod,
    isRequestTimeoutError,
    resolveApiRequestMethod,
    resolveApiRequestTimeout,
} from '../../src/runtime/modules/common/utils/apiRequestPolicy';

// Constants
import {
    BRICKS_API_READ_TIMEOUT_MS,
    BRICKS_API_WRITE_TIMEOUT_MS,
} from '../../src/runtime/modules/common/constants/apiTimeouts';
// #endregion

describe('политика таймаутов: потолок по методу (BM-27)', () => {
    it('чтения получают потолок чтения, записи — потолок записи, незнакомый метод — записи', () => {
        // Отсутствие метода — это GET: ofetch `options.method` у него не заполняет
        expect(resolveApiRequestTimeout(undefined)).toBe(BRICKS_API_READ_TIMEOUT_MS);
        expect(resolveApiRequestTimeout('get')).toBe(BRICKS_API_READ_TIMEOUT_MS);
        expect(resolveApiRequestTimeout('HEAD')).toBe(BRICKS_API_READ_TIMEOUT_MS);
        expect(resolveApiRequestTimeout('POST')).toBe(BRICKS_API_WRITE_TIMEOUT_MS);
        expect(resolveApiRequestTimeout('delete')).toBe(BRICKS_API_WRITE_TIMEOUT_MS);
        // Незнакомый глагол — запись: оптимистичная классификация опаснее осторожной
        expect(resolveApiRequestTimeout('PURGE')).toBe(BRICKS_API_WRITE_TIMEOUT_MS);
        expect(isApiWriteMethod('PATCH')).toBe(true);
        expect(isApiWriteMethod(undefined)).toBe(false);
    });

    it('метод читается с самого запроса, когда его нет в опциях', () => {
        // ofetch не копирует метод `Request`-объекта в опции, поэтому по опциям
        // POST выглядел бы как GET и получил бы потолок чтения
        expect(resolveApiRequestMethod({ method: 'post' }, undefined)).toBe('POST');
        expect(resolveApiRequestMethod('/api/bricks/', undefined)).toBeUndefined();
        expect(resolveApiRequestMethod({ method: 'post' }, 'put')).toBe('PUT');
    });

    it('явный потолок вызова сохраняется, нулевой — нет', () => {
        const explicit: IApiRequestTimeoutTarget = { method: 'POST', timeout: 120_000 };
        applyApiRequestTimeout('/api/bricks/media/upload', explicit);
        expect(explicit.timeout).toBe(120_000);

        // `timeout: 0` в ofetch означает «без потолка» — опт-аутом политика его не
        // считает, иначе исходный дефект возвращался бы тихо
        const disabled: IApiRequestTimeoutTarget = { method: 'POST', timeout: 0 };
        applyApiRequestTimeout('/api/bricks/', disabled);
        expect(disabled.timeout).toBe(BRICKS_API_WRITE_TIMEOUT_MS);
    });
});

describe('политика таймаутов: сигнал вызывающего (BM-27)', () => {
    afterEach(() => {
        vi.useRealTimers();
    });

    it('переданный сигнал не отменяет потолок — комбинированный абортится по таймауту', async () => {
        const caller = new AbortController();
        // Потолок задан явно и мал: `AbortSignal.timeout` заводит внутренний таймер
        // Node, а его подмена фейковыми таймерами не перехватывает — ждём
        // фактического срабатывания, а не проматываем время
        const options: IApiRequestTimeoutTarget = { timeout: 5, signal: caller.signal };

        applyApiRequestTimeout('/api/bricks/', options);

        // ofetch строит внутренний abort только при отсутствии signal, поэтому без
        // комбинации потолок исчез бы молча — сигнал остался бы неаборченным
        expect(options.signal).not.toBe(caller.signal);
        expect(options.signal?.aborted).toBe(false);

        await vi.waitFor(() => expect(options.signal?.aborted).toBe(true));

        expect(isRequestTimeoutError(options.signal?.reason)).toBe(true);
    });

    it('отмена вызывающего доезжает до комбинированного сигнала и таймаутом не считается', () => {
        const caller = new AbortController();
        const options: IApiRequestTimeoutTarget = { method: 'GET', signal: caller.signal };

        applyApiRequestTimeout('/api/bricks/', options);
        caller.abort(new Error('пользователь ушёл со страницы'));

        expect(options.signal?.aborted).toBe(true);
        expect(isRequestTimeoutError(options.signal?.reason)).toBe(false);
    });

    it('сигнал берётся с Request-объекта, но явный signal в опциях приоритетнее', () => {
        // ofetch не копирует в опции ни метод `Request`, ни его signal, а signal из
        // опций по правилам fetch перекрывает сигнал запроса — без fallback'а
        // отмена вызывающего не работала бы до истечения потолка
        const caller = new AbortController();
        const request = new Request('http://localhost/api/bricks/', {
            method: 'POST',
            signal: caller.signal,
        });
        const options: IApiRequestTimeoutTarget = {};

        applyApiRequestTimeout(request, options);
        expect(options.timeout).toBe(BRICKS_API_WRITE_TIMEOUT_MS);

        caller.abort(new Error('вызывающий отменил'));
        expect(options.signal?.aborted).toBe(true);
        expect(isRequestTimeoutError(options.signal?.reason)).toBe(false);

        // Явный `null` — осознанный отказ от сигнала, а не повод взять чужой
        const overridden: IApiRequestTimeoutTarget = { signal: null };
        applyApiRequestTimeout(request, overridden);
        expect(overridden.signal).toBeNull();
    });
});

describe('распознавание таймаута (BM-27)', () => {
    it('таймаут виден через цепочку cause, прочие отказы — нет', () => {
        const timeout = Object.assign(new Error('timed out'), { name: 'TimeoutError' });

        // Форма ofetch: FetchError с исходной ошибкой в cause
        expect(isRequestTimeoutError(new Error('[GET] "/api/bricks/"', { cause: timeout }))).toBe(
            true
        );
        // Обёртка RequestError поверх FetchError — цепочка глубже на уровень
        expect(
            isRequestTimeoutError(
                new Error('wrapped', { cause: new Error('fetch', { cause: timeout }) })
            )
        ).toBe(true);

        expect(isRequestTimeoutError(new Error('[GET] "/api/bricks/": 500'))).toBe(false);
        expect(isRequestTimeoutError(undefined)).toBe(false);
    });

    it('циклическая цепочка cause не зацикливает обход', () => {
        const first = new Error('first');
        const second = new Error('second', { cause: first });
        Object.defineProperty(first, 'cause', { value: second });

        expect(isRequestTimeoutError(first)).toBe(false);
    });
});

describe('клиент билдера применяет политику (BM-27)', () => {
    /**
     * Неотвечающий сервер: ответ не приходит и не падает, запрос завершается
     * только по аборту. Считает попытки, дошедшие до транспорта.
     */
    function createParkedFetch(): { fetch: typeof globalThis.fetch; getAttempts: () => number } {
        let attempts = 0;

        const parked = (_input: unknown, init?: { signal?: AbortSignal }) => {
            attempts += 1;

            return new Promise<Response>((_resolve, reject) => {
                init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), {
                    once: true,
                });
            });
        };

        return {
            fetch: parked as unknown as typeof globalThis.fetch,
            getAttempts: () => attempts,
        };
    }

    afterEach(() => {
        vi.useRealTimers();
        Reflect.deleteProperty(globalThis, 'window');
        Reflect.deleteProperty(globalThis, '$fetch');
    });

    it('зависшее чтение обрывается по дефолтному потолку и повтора не получает', async () => {
        vi.useFakeTimers();

        const { fetch: parkedFetch, getAttempts } = createParkedFetch();
        // useApiClient строит base от origin (клиентская ветка) и создаёт инстанс
        // от globalThis.$fetch — подменяем оба входа, остальное берётся из
        // стаба `#imports`
        Object.defineProperty(globalThis, 'window', {
            configurable: true,
            value: { location: { origin: 'http://localhost:3000' } },
        });
        Object.defineProperty(globalThis, '$fetch', {
            configurable: true,
            value: createFetch({ fetch: parkedFetch }),
        });

        const { apiFetcher } = useApiClient();
        const request = apiFetcher('/api/bricks/');
        const rejection = expect(request).rejects.toThrowError(/TimeoutError/);

        // Ровно на потолке чтения: до него запрос ещё летит
        await vi.advanceTimersByTimeAsync(BRICKS_API_READ_TIMEOUT_MS - 1);
        expect(getAttempts()).toBe(1);

        await vi.advanceTimersByTimeAsync(1);
        await rejection;

        // Повтора нет: без `retry: 0` дефолт ofetch отправил бы GET заново —
        // при аборте responseCode падает в 500, а 500 входит в retryStatusCodes
        expect(getAttempts()).toBe(1);
    });
});
