// #region Imports
// Vitest
import { afterEach, describe, expect, it, vi } from 'vitest';

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

    it('создаёт фетчер с публичной политикой: без cookies, без ретраев, с таймаутом', () => {
        const createMock = vi.fn((_options: Record<string, unknown>) => vi.fn());
        vi.stubGlobal('$fetch', { create: createMock });

        const { publicPageFetcher } = usePublicPageClient();

        expect(publicPageFetcher).toBeDefined();
        expect(createMock).toHaveBeenCalledOnce();

        const options = createMock.mock.calls[0]?.[0] ?? {};
        expect(options.credentials).toBe('omit');
        expect(options.retry).toBe(0);
        expect(options.timeout).toBe(PUBLIC_PAGE_REQUEST_TIMEOUT_MS);
        // Дефолтных заголовков нет — cookie/x-forwarded-*/CSRF не пробрасываются
        expect(options.headers).toBeUndefined();
        // 401-интерцептора на login нет — ошибка lookup'а не редиректит посетителя
        expect(options.onResponseError).toBeUndefined();
    });
});
