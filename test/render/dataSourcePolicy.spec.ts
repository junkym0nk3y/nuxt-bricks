// #region Imports
// Vitest
import { describe, expect, it } from 'vitest';

// Utils
import {
    checkDataSourceUrl,
    resolveDataSourceMethod,
    DEFAULT_DATA_SOURCE_MAX_REQUESTS_PER_PAGE,
    DEFAULT_DATA_SOURCE_MAX_RESPONSE_BYTES,
    DEFAULT_DATA_SOURCE_TOTAL_DEADLINE_MS,
} from '../../src/runtime/modules/render/utils/dataSourcePolicy';
// #endregion

describe('resolveDataSourceMethod', () => {
    it('нормализует разрешённые методы к верхнему регистру', () => {
        expect(resolveDataSourceMethod('get')).toBe('GET');
        expect(resolveDataSourceMethod('GET')).toBe('GET');
        expect(resolveDataSourceMethod('head')).toBe('HEAD');
    });

    it('без метода возвращает GET', () => {
        expect(resolveDataSourceMethod(undefined)).toBe('GET');
        expect(resolveDataSourceMethod('')).toBe('GET');
    });

    it('отклоняет мутирующие методы', () => {
        expect(resolveDataSourceMethod('POST')).toBeNull();
        expect(resolveDataSourceMethod('put')).toBeNull();
        expect(resolveDataSourceMethod('DELETE')).toBeNull();
        expect(resolveDataSourceMethod('OPTIONS')).toBeNull();
    });
});

describe('checkDataSourceUrl', () => {
    it('разрешает относительные URL без allow-list', () => {
        expect(checkDataSourceUrl('/api/products', []).allowed).toBe(true);
        expect(checkDataSourceUrl('/internal-api/data?limit=5', []).allowed).toBe(true);
    });

    it('отклоняет protocol-relative и не начинающиеся с / URL', () => {
        expect(checkDataSourceUrl('//evil.example/api', []).allowed).toBe(false);
        expect(checkDataSourceUrl('api/products', []).allowed).toBe(false);
        expect(checkDataSourceUrl('', []).allowed).toBe(false);
    });

    it('отклоняет абсолютные URL без allow-list', () => {
        const result = checkDataSourceUrl('https://api.example.com/items', []);
        expect(result.allowed).toBe(false);
        expect(result).toMatchObject({ reason: expect.stringContaining('allowedHosts') });
    });

    it('разрешает абсолютные http(s)-URL для хоста из allow-list (без учёта регистра)', () => {
        const allowedHosts = ['API.example.com'];
        expect(checkDataSourceUrl('https://api.example.com/items', allowedHosts).allowed).toBe(
            true
        );
        expect(checkDataSourceUrl('http://api.example.com:8080/items', allowedHosts).allowed).toBe(
            true
        );
    });

    it('отклоняет чужой хост, поддомен и url-обманки с userinfo', () => {
        const allowedHosts = ['api.example.com'];
        expect(checkDataSourceUrl('https://evil.example/items', allowedHosts).allowed).toBe(false);
        expect(checkDataSourceUrl('https://sub.api.example.com/items', allowedHosts).allowed).toBe(
            false
        );
        expect(
            checkDataSourceUrl('https://api.example.com@evil.example/items', allowedHosts).allowed
        ).toBe(false);
    });

    it('отклоняет не-http(s) протоколы', () => {
        const allowedHosts = ['api.example.com'];
        expect(checkDataSourceUrl('ftp://api.example.com/file', allowedHosts).allowed).toBe(false);
        expect(checkDataSourceUrl('javascript:alert(1)', allowedHosts).allowed).toBe(false);
        expect(checkDataSourceUrl('file:///etc/passwd', allowedHosts).allowed).toBe(false);
    });
});

describe('dataSourcePolicy: resource budget', () => {
    it('дефолты бюджета заданы', () => {
        expect(DEFAULT_DATA_SOURCE_MAX_RESPONSE_BYTES).toBe(1024 * 1024);
        expect(DEFAULT_DATA_SOURCE_MAX_REQUESTS_PER_PAGE).toBe(24);
        expect(DEFAULT_DATA_SOURCE_TOTAL_DEADLINE_MS).toBe(15000);
    });
});
