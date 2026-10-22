// #region Imports
// Vitest
import { describe, expect, it } from 'vitest';

// Types
import type { TDataSourceUrlParamValue } from '../../src/runtime/modules/render/types/dataSourceParams';

// Utils
import {
    buildDataSourceUrl,
    isDataSourceUrlParamValue,
} from '../../src/runtime/modules/render/utils/dataSourceParams';
// #endregion

/**
 * Builds the substitution arguments out of the declared parameters: the declared
 * names and the resolved values are different sets, and it is exactly the
 * difference between them that decides whether a placeholder counts as
 * unresolved.
 *
 * @param resolved - Values that made it through the resolution.
 * @param declaredOnly - Names declared by the brick file whose value did not
 * arrive.
 */
function buildParams(
    resolved: Record<string, TDataSourceUrlParamValue>,
    declaredOnly: string[] = []
): { params: Map<string, TDataSourceUrlParamValue>; declaredParamKeys: Set<string> } {
    return {
        params: new Map(Object.entries(resolved)),
        declaredParamKeys: new Set([...Object.keys(resolved), ...declaredOnly]),
    };
}

describe('isDataSourceUrlParamValue: what may be carried into a URL', () => {
    it('accepts a string, a boolean and a finite number', () => {
        expect(isDataSourceUrlParamValue('news')).toBe(true);
        expect(isDataSourceUrlParamValue('')).toBe(true);
        expect(isDataSourceUrlParamValue(0)).toBe(true);
        expect(isDataSourceUrlParamValue(-12.5)).toBe(true);
        expect(isDataSourceUrlParamValue(true)).toBe(true);
        expect(isDataSourceUrlParamValue(false)).toBe(true);
    });

    it('rejects values without an unambiguous string form', () => {
        // The cast that used to stand here let these through, and String() carried
        // "[object Object]", the source text of a function or NaN into the URL
        expect(isDataSourceUrlParamValue({ id: 1 })).toBe(false);
        expect(isDataSourceUrlParamValue([1, 2])).toBe(false);
        expect(isDataSourceUrlParamValue(() => 'x')).toBe(false);
        expect(isDataSourceUrlParamValue(Symbol('id'))).toBe(false);
        expect(isDataSourceUrlParamValue(10n)).toBe(false);
        expect(isDataSourceUrlParamValue(Number.NaN)).toBe(false);
        expect(isDataSourceUrlParamValue(Number.POSITIVE_INFINITY)).toBe(false);
        expect(isDataSourceUrlParamValue(Number.NEGATIVE_INFINITY)).toBe(false);
        expect(isDataSourceUrlParamValue(null)).toBe(false);
        expect(isDataSourceUrlParamValue(undefined)).toBe(false);
    });
});

describe('buildDataSourceUrl: substitution and unresolved placeholders', () => {
    it('substitutes the values with escaping', () => {
        const { params, declaredParamKeys } = buildParams({
            category: 'news & fun',
            page: 2,
            draft: false,
        });

        const result = buildDataSourceUrl(
            '/api/items/:category?page=:page&draft=:draft',
            params,
            declaredParamKeys
        );

        expect(result.url).toBe('/api/items/news%20%26%20fun?page=2&draft=false');
        expect(result.unresolvedParamKeys).toEqual([]);
    });

    it('counts a declared parameter without a value as unresolved anywhere in the template', () => {
        const { params, declaredParamKeys } = buildParams({}, ['id']);

        const inSegment = buildDataSourceUrl('/api/users/:id', params, declaredParamKeys);
        expect(inSegment.unresolvedParamKeys).toEqual(['id']);

        // A placeholder glued to neighboring text is indistinguishable from a
        // legitimate colon on its own, but the declaration removes the ambiguity
        const glued = buildDataSourceUrl('/api/users/prefix-:id', params, declaredParamKeys);
        expect(glued.unresolvedParamKeys).toEqual(['id']);
        expect(glued.url).toBe('/api/users/prefix-:id');
    });

    it('claims an undeclared placeholder that occupies a whole segment or a whole query value', () => {
        const { params, declaredParamKeys } = buildParams({});

        expect(
            buildDataSourceUrl('/api/items/:missing', params, declaredParamKeys).unresolvedParamKeys
        ).toEqual(['missing']);
        expect(
            buildDataSourceUrl('/api/items/:missing/versions', params, declaredParamKeys)
                .unresolvedParamKeys
        ).toEqual(['missing']);
        expect(
            buildDataSourceUrl('/api/items?id=:missing', params, declaredParamKeys)
                .unresolvedParamKeys
        ).toEqual(['missing']);
        expect(
            buildDataSourceUrl('/api/items?id=:missing&sort=asc', params, declaredParamKeys)
                .unresolvedParamKeys
        ).toEqual(['missing']);
    });

    it('does not claim an undeclared placeholder that is only a part of a value', () => {
        const { params, declaredParamKeys } = buildParams({});

        // The value of `filter` is `kind=:draft` as a whole, so the colon sits
        // inside a value — the same case as a time in a query
        const insideQueryValue = buildDataSourceUrl(
            '/api/items?filter=kind=:draft',
            params,
            declaredParamKeys
        );
        expect(insideQueryValue.url).toBe('/api/items?filter=kind=:draft');
        expect(insideQueryValue.unresolvedParamKeys).toEqual([]);

        // In the path part an `=` is an ordinary character: the placeholder does
        // not occupy the segment on its own
        const insidePathSegment = buildDataSourceUrl(
            '/api/items/filter=:draft',
            params,
            declaredParamKeys
        );
        expect(insidePathSegment.url).toBe('/api/items/filter=:draft');
        expect(insidePathSegment.unresolvedParamKeys).toEqual([]);
    });

    it('does not take a legitimate colon inside a value for a placeholder', () => {
        const { params, declaredParamKeys } = buildParams({});

        // A time in a query: the source used to be dropped as "unresolved params"
        // in full, and the component stayed on its fallback props
        const relative = buildDataSourceUrl('/api/events?at=12:30', params, declaredParamKeys);
        expect(relative.url).toBe('/api/events?at=12:30');
        expect(relative.unresolvedParamKeys).toEqual([]);

        // An absolute URL: the colons of the scheme, of the port and of the
        // credentials are not placeholders either
        const absolute = buildDataSourceUrl(
            'https://api.example.com:8443/events?at=12:30',
            params,
            declaredParamKeys
        );
        expect(absolute.url).toBe('https://api.example.com:8443/events?at=12:30');
        expect(absolute.unresolvedParamKeys).toEqual([]);
    });

    it('does not re-read a substituted value that carries a colon', () => {
        const { params, declaredParamKeys } = buildParams({ at: '12:30' });

        const result = buildDataSourceUrl('/api/events/:at', params, declaredParamKeys);

        expect(result.url).toBe('/api/events/12%3A30');
        expect(result.unresolvedParamKeys).toEqual([]);
    });

    it('keeps names from Object.prototype as parameter names, not as members of the prototype', () => {
        const { params, declaredParamKeys } = buildParams({ toString: 'own' });

        const substituted = buildDataSourceUrl('/api/items/:toString', params, declaredParamKeys);
        expect(substituted.url).toBe('/api/items/own');
        expect(substituted.unresolvedParamKeys).toEqual([]);

        const empty = buildParams({});
        const unresolved = buildDataSourceUrl(
            '/api/items/:__proto__',
            empty.params,
            empty.declaredParamKeys
        );
        expect(unresolved.unresolvedParamKeys).toEqual(['__proto__']);
    });
});
