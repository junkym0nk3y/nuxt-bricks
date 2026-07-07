// #region Imports
// Vitest
import { describe, expect, it } from 'vitest';

// Utils
import {
    toCamelCase,
    toCamelCaseShallow,
    toSnakeCase,
    toSnakeCaseShallow,
    toSnakeCaseString,
} from '../src/runtime/modules/common/utils/case-transform';
// #endregion

describe('toCamelCase', () => {
    it('конвертирует ключи рекурсивно, включая вложенные объекты и массивы', () => {
        const result = toCamelCase<Record<string, unknown>>({
            created_at: '2026-01-01',
            nested_obj: { social_image: 'img.png' },
            items_list: [{ url_prefix: 'blog' }],
        });

        expect(result).toEqual({
            createdAt: '2026-01-01',
            nestedObj: { socialImage: 'img.png' },
            itemsList: [{ urlPrefix: 'blog' }],
        });
    });

    it('возвращает null/undefined/примитивы как есть', () => {
        expect(toCamelCase(null)).toBeNull();
        expect(toCamelCase(undefined)).toBeUndefined();
        expect(toCamelCase(42)).toBe(42);
        expect(toCamelCase('snake_case')).toBe('snake_case');
    });

    it('не мутирует исходный объект', () => {
        const source = { created_at: 'x' };
        toCamelCase(source);
        expect(source).toEqual({ created_at: 'x' });
    });
});

describe('toCamelCaseShallow', () => {
    it('конвертирует только top-level ключи, не трогая вложенные значения', () => {
        const schema = { some_component: { snake_key: 1 } };
        const result = toCamelCaseShallow<Record<string, unknown>>({
            page_schema: schema,
            created_at: 'x',
        });

        expect(result.pageSchema).toBe(schema);
        expect(result.createdAt).toBe('x');
        expect((result.pageSchema as Record<string, unknown>).snake_key).toBeUndefined();
    });
});

describe('toSnakeCaseString', () => {
    it('конвертирует camelCase в snake_case', () => {
        expect(toSnakeCaseString('urlPrefix')).toBe('url_prefix');
        expect(toSnakeCaseString('backgroundColor')).toBe('background_color');
        expect(toSnakeCaseString('pagename')).toBe('pagename');
    });

    it('схлопывает повторные подчёркивания', () => {
        expect(toSnakeCaseString('already_snakeCase')).toBe('already_snake_case');
    });
});

describe('toSnakeCaseShallow', () => {
    it('конвертирует только top-level ключи', () => {
        const schema = { camelKey: 1 };
        const result = toSnakeCaseShallow({ socialImage: null, pageSchema: schema });

        expect(result).toEqual({ social_image: null, page_schema: schema });
        expect(result.page_schema).toBe(schema);
    });
});

describe('toSnakeCase', () => {
    it('конвертирует ключи рекурсивно', () => {
        const result = toSnakeCase<Record<string, unknown>>({
            urlPrefix: 'blog',
            nestedObj: { socialImage: null },
            itemsList: [{ createdAt: 'x' }],
        });

        expect(result).toEqual({
            url_prefix: 'blog',
            nested_obj: { social_image: null },
            items_list: [{ created_at: 'x' }],
        });
    });

    it('возвращает null/undefined/примитивы как есть', () => {
        expect(toSnakeCase(null)).toBeNull();
        expect(toSnakeCase(undefined)).toBeUndefined();
        expect(toSnakeCase('camelCase')).toBe('camelCase');
    });
});
