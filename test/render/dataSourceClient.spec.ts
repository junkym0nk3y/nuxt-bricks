// #region Imports
// Vitest
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ofetch
import { createFetch } from 'ofetch';

// Utils
import { isRequestTimeoutError } from '../../src/runtime/modules/common/utils/apiRequestPolicy';
// #endregion

// #region Mocks
const { dataSourcesConfig } = vi.hoisted(() => ({
    dataSourcesConfig: { timeoutMs: 25 },
}));

vi.mock('#imports', async (importOriginal) => {
    const actual = await importOriginal<Record<string, unknown>>();

    return {
        ...actual,
        useRuntimeConfig: () => ({
            app: { baseURL: '/' },
            public: { bricksDataSources: { ...dataSourcesConfig } },
        }),
    };
});
// #endregion

// #region Composables
import { useDataSourceClient } from '../../src/runtime/modules/render/composables/useDataSourceClient';
// #endregion

/**
 * Сервер, который отдаёт заголовки и начало JSON, но никогда не досылает тело:
 * поток ошибается только по аборту переданного сигнала — так ведёт себя реальный
 * fetch, чей `Response` привязан к сигналу запроса.
 *
 * @param loseAbortReason - Гасить ли причину аборта, подменяя её на `AbortError`:
 * так браузер ведёт себя при аборте во время чтения тела, а здесь тело читается
 * вручную, потоком, то есть ровно в этой фазе.
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

describe('useDataSourceClient: потолок одного запроса', () => {
    /**
     * Подменяет транспорт зависающим на теле сервером.
     *
     * @param loseAbortReason - Моделировать ли браузерную потерю причины аборта.
     */
    function stubTransport(loseAbortReason = false): void {
        // Клиент строит base от origin (клиентская ветка) и инстанс — от
        // globalThis.$fetch; конфигурация приходит из мока `#imports`
        Object.defineProperty(globalThis, 'window', {
            configurable: true,
            value: { location: { origin: 'http://localhost:3000' } },
        });
        Object.defineProperty(globalThis, '$fetch', {
            configurable: true,
            value: createFetch({ fetch: createHangingBodyFetch(loseAbortReason) }),
        });
    }

    beforeEach(() => {
        stubTransport();
    });

    afterEach(() => {
        Reflect.deleteProperty(globalThis, 'window');
        Reflect.deleteProperty(globalThis, '$fetch');
    });

    it('зависшее тело обрывается по потолку даже без сигнала вызывающего', async () => {
        // Тело здесь читается вручную, потоком, уже после ответа ofetch, поэтому
        // опция `timeout` его не покрывает: её таймер снимается на заголовках.
        // Потолок обязан ставить сам клиент, а не вызывающий своим сигналом
        const { dataSourceFetcher } = useDataSourceClient();

        await expect(dataSourceFetcher('/api/items', { method: 'GET' })).rejects.toSatisfy(
            isRequestTimeoutError
        );
    });

    it('обрыв тела остаётся таймаутом там, где платформа потеряла причину', async () => {
        stubTransport(true);

        const { dataSourceFetcher } = useDataSourceClient();

        await expect(dataSourceFetcher('/api/items', { method: 'GET' })).rejects.toSatisfy(
            isRequestTimeoutError
        );
    });

    it('отмена вызывающего доезжает до запроса и таймаутом не считается', async () => {
        const { dataSourceFetcher } = useDataSourceClient();
        const runDeadline = new AbortController();
        const request = dataSourceFetcher('/api/items', {
            method: 'GET',
            signal: runDeadline.signal,
        });

        runDeadline.abort(new Error('общий дедлайн прогона'));

        const error = await request.catch((reason: unknown) => reason);

        expect(isRequestTimeoutError(error)).toBe(false);
    });

    it('общий дедлайн прогона не выдаёт себя за таймаут даже при потерянной причине', async () => {
        stubTransport(true);

        const { dataSourceFetcher } = useDataSourceClient();
        const runDeadline = new AbortController();
        const request = dataSourceFetcher('/api/items', {
            method: 'GET',
            signal: runDeadline.signal,
        });

        runDeadline.abort(new Error('общий дедлайн прогона'));

        const error = await request.catch((reason: unknown) => reason);

        expect(isRequestTimeoutError(error)).toBe(false);
    });
});
