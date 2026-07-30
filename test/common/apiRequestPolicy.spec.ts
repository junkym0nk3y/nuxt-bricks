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

describe('политика таймаутов: потолок по методу', () => {
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

    it('явный потолок вызова сохраняется, нулевой и неинтерпретируемый — нет', () => {
        const explicit: IApiRequestTimeoutTarget = { method: 'POST', timeout: 120_000 };
        applyApiRequestTimeout('/api/bricks/media/upload', explicit);
        expect(explicit.timeout).toBe(120_000);

        // `timeout: 0` в ofetch означает «без потолка» — опт-аутом политика его не
        // считает, иначе исходный дефект возвращался бы тихо
        const disabled: IApiRequestTimeoutTarget = { method: 'POST', timeout: 0 };
        applyApiRequestTimeout('/api/bricks/', disabled);
        expect(disabled.timeout).toBe(BRICKS_API_WRITE_TIMEOUT_MS);

        // `Infinity`/`NaN` — не «ждать дольше», а потерянный потолок: сигнал на
        // таком значении либо не сработает никогда, либо упадёт до отправки
        const infinite: IApiRequestTimeoutTarget = {
            method: 'GET',
            timeout: Number.POSITIVE_INFINITY,
        };
        applyApiRequestTimeout('/api/bricks/', infinite);
        expect(infinite.timeout).toBe(BRICKS_API_READ_TIMEOUT_MS);

        const notANumber: IApiRequestTimeoutTarget = { method: 'GET', timeout: Number.NaN };
        applyApiRequestTimeout('/api/bricks/', notANumber);
        expect(notANumber.timeout).toBe(BRICKS_API_READ_TIMEOUT_MS);
    });
});

describe('политика таймаутов: сигнал вызывающего', () => {
    afterEach(() => {
        vi.useRealTimers();
    });

    it('потолок ставится сигналом и без сигнала вызывающего', async () => {
        // Опция `timeout` покрывает только ожидание заголовков: её таймер ofetch
        // снимает сразу после `fetch`, а тело читается позже. Границу обеих фаз
        // держит сигнал, поэтому он обязателен, а не появляется лишь поверх чужого
        const options: IApiRequestTimeoutTarget = { method: 'GET', timeout: 5 };

        applyApiRequestTimeout('/api/bricks/', options);

        expect(options.signal).toBeDefined();
        expect(options.signal?.aborted).toBe(false);

        await vi.waitFor(() => expect(options.signal?.aborted).toBe(true));

        expect(isRequestTimeoutError(options.signal?.reason)).toBe(true);
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
    });

    it('явный signal: null отказывается от сигнала запроса, но не от потолка', async () => {
        const caller = new AbortController();
        const request = new Request('http://localhost/api/bricks/', {
            method: 'POST',
            signal: caller.signal,
        });
        const options: IApiRequestTimeoutTarget = { signal: null, timeout: 5 };

        applyApiRequestTimeout(request, options);

        // Сохранённый `null` означал бы запрос без всякой границы — тихий возврат
        // исходного дефекта, ровно как `timeout: 0`
        expect(options.signal).not.toBeNull();

        // Отказ касается наследования сигнала с запроса: отмена его контроллера
        // до итогового сигнала не доезжает
        caller.abort(new Error('вызывающий отменил'));
        expect(options.signal?.aborted).toBe(false);

        await vi.waitFor(() => expect(options.signal?.aborted).toBe(true));
        expect(isRequestTimeoutError(options.signal?.reason)).toBe(true);
    });
});

describe('распознавание таймаута', () => {
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

describe('клиент билдера применяет политику', () => {
    /**
     * Неотвечающий сервер: ответ не приходит и не падает, запрос завершается
     * только по аборту. Считает попытки, дошедшие до транспорта.
     */
    function createParkedFetch(): { fetch: typeof globalThis.fetch; getAttempts: () => number } {
        let attempts = 0;

        const parked: typeof globalThis.fetch = (_input, init) => {
            attempts += 1;

            return new Promise<Response>((_resolve, reject) => {
                init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), {
                    once: true,
                });
            });
        };

        return {
            fetch: parked,
            getAttempts: () => attempts,
        };
    }

    /**
     * Отвечающий заголовками, но не досылающий тело сервер: поток тела остаётся
     * открытым и ошибается только по аборту переданного сигнала — так ведёт себя
     * реальный fetch, чей `Response` привязан к сигналу запроса.
     *
     * @param loseAbortReason - Гасить ли причину аборта, подменяя её на
     * `AbortError`. Так делает Chrome при аборте во время чтения тела (проверено
     * живым замером) — независимо от того, чем абортировали; Node в той же фазе
     * причину сохраняет. Обе платформы нужно моделировать: только на первой
     * видно, работает ли восстановление причины по сигналу.
     */
    function createHangingBodyFetch(loseAbortReason = false): typeof globalThis.fetch {
        const hanging: typeof globalThis.fetch = (_input, init) => {
            const signal = init?.signal;
            const body = new ReadableStream<Uint8Array>({
                start(controller) {
                    controller.enqueue(new TextEncoder().encode('{"items":['));

                    const fail = () =>
                        controller.error(
                            loseAbortReason
                                ? new DOMException('The user aborted a request.', 'AbortError')
                                : signal?.reason
                        );

                    if (signal?.aborted) {
                        fail();
                        return;
                    }

                    signal?.addEventListener('abort', fail, { once: true });
                },
            });

            return Promise.resolve(
                new Response(body, {
                    status: 200,
                    headers: { 'content-type': 'application/json' },
                })
            );
        };

        return hanging;
    }

    /**
     * Готовит клиент билдера на подменённом транспорте: `useApiClient` строит base
     * от origin (клиентская ветка) и создаёт инстанс от `globalThis.$fetch`.
     */
    function createClientOn(fetchStub: typeof globalThis.fetch): ReturnType<typeof useApiClient> {
        Object.defineProperty(globalThis, 'window', {
            configurable: true,
            value: { location: { origin: 'http://localhost:3000' } },
        });
        Object.defineProperty(globalThis, '$fetch', {
            configurable: true,
            value: createFetch({ fetch: fetchStub }),
        });

        return useApiClient();
    }

    afterEach(() => {
        vi.useRealTimers();
        Reflect.deleteProperty(globalThis, 'window');
        Reflect.deleteProperty(globalThis, '$fetch');
    });

    it('зависшее чтение обрывается по потолку и повтора не получает', async () => {
        const { fetch: parkedFetch, getAttempts } = createParkedFetch();
        const { apiFetcher } = createClientOn(parkedFetch);

        // Малый потолок вместо проматывания времени: границу держит
        // `AbortSignal.timeout`, чей таймер живёт в Node и подмену таймеров
        // vitest не замечает. Проверяем классификатором, а не текстом: текст
        // обрыва — транспортный (`<no response> …`), имя лежит в цепочке `cause`
        await expect(apiFetcher('/api/bricks/', { timeout: 20 })).rejects.toSatisfy(
            isRequestTimeoutError
        );

        // Повтора нет: без `retry: 0` дефолт ofetch отправил бы GET заново —
        // при аборте responseCode падает в 500, а 500 входит в retryStatusCodes
        expect(getAttempts()).toBe(1);
    });

    it('зависшее тело ответа тоже обрывается по потолку', async () => {
        const { apiFetcher } = createClientOn(createHangingBodyFetch());

        // Дефект, ради которого потолок переехал в сигнал: заголовки пришли,
        // таймер ofetch снялся, а чтение тела осталось бы без границы — вместе с
        // поднятым `isSubmitting` и недостижимым `finally` у вызывающего
        const request = apiFetcher('/api/bricks/', { timeout: 20 });

        await expect(request).rejects.toSatisfy(isRequestTimeoutError);
    });

    it('обрыв тела остаётся таймаутом там, где платформа потеряла причину', async () => {
        const { apiFetcher } = createClientOn(createHangingBodyFetch(true));

        // Браузер в этой фазе подменяет причину на `AbortError`, поэтому без
        // восстановления по сигналу запись получила бы текст отмены вместо честного
        // «исход неизвестен», а список страниц — не получил бы сверки
        await expect(
            apiFetcher('/api/bricks/', { method: 'POST', body: {}, timeout: 20 })
        ).rejects.toSatisfy(isRequestTimeoutError);
    });

    it('отмена вызывающего таймаутом не становится, даже когда причину потеряли', async () => {
        const { apiFetcher } = createClientOn(createHangingBodyFetch(true));
        const caller = new AbortController();
        const request = apiFetcher('/api/bricks/', { signal: caller.signal, timeout: 10_000 });

        caller.abort(new Error('пользователь ушёл со страницы'));

        // Судим по `reason` сигнала, а не по имени ошибки: иначе уход пользователя
        // и общий дедлайн прогона data sources стали бы «таймаутами сервера»
        const error = await request.catch((reason: unknown) => reason);

        expect(isRequestTimeoutError(error)).toBe(false);
    });
});
