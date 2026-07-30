// #region Imports
// Vitest
import { afterEach, describe, expect, it, vi } from 'vitest';

// ofetch
import { createFetch } from 'ofetch';

// Utils
import { isRequestTimeoutError } from '../../src/runtime/modules/common/utils/apiRequestPolicy';

// Composables
import {
    PUBLIC_PAGE_REQUEST_TIMEOUT_MS,
    resolvePublicPageBaseUrl,
    usePublicPageClient,
} from '../../src/runtime/modules/render/composables/usePublicPageClient';
// #endregion

describe('resolvePublicPageBaseUrl', () => {
    it('SSR: относительный app.baseURL с trailing slash (внутренний вызов Nitro)', () => {
        expect(resolvePublicPageBaseUrl('/', true)).toBe('/');
        expect(resolvePublicPageBaseUrl('/app', true)).toBe('/app/');
        expect(resolvePublicPageBaseUrl('/app/', true)).toBe('/app/');
    });

    it('клиент: origin + app.baseURL', () => {
        expect(resolvePublicPageBaseUrl('/app', false, 'https://example.com')).toBe(
            'https://example.com/app/'
        );
        expect(resolvePublicPageBaseUrl('/', false, 'https://example.com')).toBe(
            'https://example.com/'
        );
    });
});

describe('usePublicPageClient', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('создаёт фетчер с публичной политикой: без cookies, без ретраев', () => {
        const createMock = vi.fn((_options: Record<string, unknown>) => vi.fn());
        vi.stubGlobal('$fetch', { create: createMock });

        const { publicPageFetcher } = usePublicPageClient();

        expect(publicPageFetcher).toBeDefined();
        expect(createMock).toHaveBeenCalledOnce();

        const options = createMock.mock.calls[0]?.[0] ?? {};
        expect(options.credentials).toBe('omit');
        expect(options.retry).toBe(0);
        // Дефолтных заголовков нет — cookie/x-forwarded-*/CSRF не пробрасываются
        expect(options.headers).toBeUndefined();
        // 401-интерцептора на login нет — ошибка lookup'а не редиректит посетителя
        expect(options.onResponseError).toBeUndefined();
        // Потолка в опциях инстанса нет намеренно: его ставит сам фетчер, и
        // второе объявление того же бюджета могло бы разъехаться
        expect(options.timeout).toBeUndefined();
    });

    it('потолок ожидания ставится на каждый запрос', async () => {
        const requests: { signal?: AbortSignal | null }[] = [];
        const captured: typeof globalThis.fetch = (_input, init) => {
            requests.push({ signal: init?.signal });

            return Promise.resolve(new Response('{}', { status: 200 }));
        };

        vi.stubGlobal('window', { location: { origin: 'http://localhost:3000' } });
        vi.stubGlobal('$fetch', createFetch({ fetch: captured }));

        const { publicPageFetcher } = usePublicPageClient();
        await publicPageFetcher('/api/bricks/page');

        // Бюджет по умолчанию — тот же, что объявлен константой клиента
        expect(requests[0]?.signal).toBeDefined();
        expect(PUBLIC_PAGE_REQUEST_TIMEOUT_MS).toBe(10_000);
    });

    it('зависшее тело ответа обрывается по потолку, а не держит посетителя', async () => {
        // Опция `timeout` покрывает лишь ожидание заголовков: её таймер ofetch
        // снимает сразу после `fetch`. Без политики backend, отдавший статус и
        // замолчавший посреди JSON, держал бы посетителя без всякой границы
        const hanging: typeof globalThis.fetch = (_input, init) => {
            const signal = init?.signal;
            const body = new ReadableStream<Uint8Array>({
                start(controller) {
                    controller.enqueue(new TextEncoder().encode('{"pagename":'));

                    const fail = () => controller.error(signal?.reason);

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

        vi.stubGlobal('window', { location: { origin: 'http://localhost:3000' } });
        vi.stubGlobal('$fetch', createFetch({ fetch: hanging }));

        const { publicPageFetcher } = usePublicPageClient();

        await expect(publicPageFetcher('/api/bricks/page', { timeout: 20 })).rejects.toSatisfy(
            isRequestTimeoutError
        );
    });
});
