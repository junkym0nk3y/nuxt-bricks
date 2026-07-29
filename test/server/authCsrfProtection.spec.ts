// #region Imports
// Vitest
import { describe, expect, it, vi } from 'vitest';

// Types
import type { ICsrfRequestContext } from '../../src/runtime/server/utils/auth/csrfProtection';
// #endregion

// #region Mocks
// csrfProtection.ts импортирует `nitropack/runtime` (для assertCsrfSafe) — вне
// Nuxt-сборки реальный пакет резолвит виртуальные Nitro-модули и падает при
// импорте; чистые checkCsrf/isCsrfProtectedPath его не вызывают, поэтому стаб
// достаточен (паттерн test/server/requestClientIp.spec.ts).
vi.mock('nitropack/runtime', () => ({
    useRuntimeConfig: () => ({}),
}));

const { checkCsrf, isCsrfProtectedPath } =
    await import('../../src/runtime/server/utils/auth/csrfProtection');
// #endregion

/** Базовый unsafe-контекст без каких-либо признаков происхождения. */
const BARE_POST: ICsrfRequestContext = {
    method: 'POST',
    origin: undefined,
    secFetchSite: undefined,
    hasCsrfHeader: false,
    effectiveHost: 'app.example.com',
    effectiveProtocol: 'https',
};

describe('csrfProtection: чистая проверка контекста запроса', () => {
    it('safe-методы всегда разрешены', () => {
        for (const method of ['GET', 'HEAD', 'OPTIONS', 'get']) {
            expect(checkCsrf({ ...BARE_POST, method }).allowed).toBe(true);
        }
    });

    it('кастомный заголовок разрешает unsafe-запрос без Origin', () => {
        expect(checkCsrf({ ...BARE_POST, hasCsrfHeader: true }).allowed).toBe(true);
    });

    it('unsafe без Origin, Sec-Fetch-Site и заголовка — отклоняется', () => {
        expect(checkCsrf(BARE_POST).allowed).toBe(false);
    });

    it('Sec-Fetch-Site same-origin/none — разрешён, same-site/cross-site — нет', () => {
        expect(checkCsrf({ ...BARE_POST, secFetchSite: 'same-origin' }).allowed).toBe(true);
        expect(checkCsrf({ ...BARE_POST, secFetchSite: 'none' }).allowed).toBe(true);
        expect(checkCsrf({ ...BARE_POST, secFetchSite: 'same-site' }).allowed).toBe(false);
        expect(checkCsrf({ ...BARE_POST, secFetchSite: 'cross-site' }).allowed).toBe(false);
    });

    it('Origin same-origin (с портом и без) — разрешён', () => {
        expect(checkCsrf({ ...BARE_POST, origin: 'https://app.example.com' }).allowed).toBe(true);
        expect(
            checkCsrf({
                ...BARE_POST,
                origin: 'http://app.example.com:3000',
                effectiveHost: 'app.example.com:3000',
                effectiveProtocol: 'http',
            }).allowed
        ).toBe(true);
    });

    it('порт участвует в сравнении: другой порт того же хоста — отказ', () => {
        expect(
            checkCsrf({
                ...BARE_POST,
                origin: 'http://app.example.com:8080',
                effectiveHost: 'app.example.com',
                effectiveProtocol: 'http',
            }).allowed
        ).toBe(false);
    });

    it('дефолтные порты нормализуются: https-origin матчит Host с явным :443', () => {
        expect(
            checkCsrf({
                ...BARE_POST,
                origin: 'https://app.example.com',
                effectiveHost: 'app.example.com:443',
            }).allowed
        ).toBe(true);
    });

    it('схема участвует в сравнении: http-origin к https-поверхности — отказ', () => {
        expect(checkCsrf({ ...BARE_POST, origin: 'http://app.example.com' }).allowed).toBe(false);
        expect(
            checkCsrf({
                ...BARE_POST,
                origin: 'https://app.example.com',
                effectiveProtocol: 'http',
            }).allowed
        ).toBe(false);
        // Недефолтный для чужой схемы порт не «нормализуется» в совпадение
        expect(checkCsrf({ ...BARE_POST, origin: 'http://app.example.com:443' }).allowed).toBe(
            false
        );
    });

    it('cross-origin, sibling same-site и opaque origin — отклоняются', () => {
        expect(checkCsrf({ ...BARE_POST, origin: 'https://evil.example' }).allowed).toBe(false);
        expect(checkCsrf({ ...BARE_POST, origin: 'https://evil.example.com' }).allowed).toBe(false);
        expect(checkCsrf({ ...BARE_POST, origin: 'null' }).allowed).toBe(false);
        expect(checkCsrf({ ...BARE_POST, origin: '::not-a-url::' }).allowed).toBe(false);
    });

    it('Origin без эффективного Host — отклоняется', () => {
        expect(
            checkCsrf({ ...BARE_POST, origin: 'https://app.example.com', effectiveHost: undefined })
                .allowed
        ).toBe(false);
    });

    it('Sec-Fetch-Site приоритетнее Origin (same-site с совпавшим хостом — отказ)', () => {
        expect(
            checkCsrf({
                ...BARE_POST,
                secFetchSite: 'same-site',
                origin: 'https://app.example.com',
            }).allowed
        ).toBe(false);
    });

    it('isCsrfProtectedPath: покрывает /api/bricks (включая media-ручки), не трогает прочее', () => {
        expect(isCsrfProtectedPath('/api/bricks/auth/login')).toBe(true);
        expect(isCsrfProtectedPath('/api/bricks/123')).toBe(true);
        expect(isCsrfProtectedPath('/api/bricks/media/s3-proxy')).toBe(true);
        expect(isCsrfProtectedPath('/api/bricks/media/s3-page-thumbnail')).toBe(true);
        expect(isCsrfProtectedPath('/api/other')).toBe(false);
        expect(isCsrfProtectedPath('/landing')).toBe(false);
        // Бывший /mock-api/** больше не в скоупе модуля
        expect(isCsrfProtectedPath('/mock-api/s3-page-thumbnail')).toBe(false);
    });
});
