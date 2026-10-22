/**
 * The interface language of a builder route. The choice of the switch wins, then the
 * locale of the application, and only a locale bricks has translations for is ever
 * applied: the cookie is shared by the whole site and may hold anything, and the host may
 * run in a locale of its own. The browser is not asked.
 */

// #region Imports
// Vitest
import { describe, expect, it } from 'vitest';

// Utils
import { pickBuilderLocale } from '../../src/runtime/modules/builder/core/utils/builderLocale';
// #endregion

describe('pickBuilderLocale', () => {
    it('prefers the language saved by the switch over the locale of the application', () => {
        expect(pickBuilderLocale('en', 'ru')).toBe('en');
        expect(pickBuilderLocale('ru', 'en')).toBe('ru');
    });

    it('keeps the locale of the application when nothing is saved', () => {
        expect(pickBuilderLocale(undefined, 'ru')).toBe('ru');
        expect(pickBuilderLocale(null, 'en')).toBe('en');
    });

    it('ignores a saved value bricks has no translations for', () => {
        expect(pickBuilderLocale('de', 'ru')).toBe('ru');
        expect(pickBuilderLocale(42, 'en')).toBe('en');
    });

    it('falls back to Russian when the host runs in a locale of its own', () => {
        expect(pickBuilderLocale(undefined, 'de')).toBe('ru');
        expect(pickBuilderLocale('fr', 'de')).toBe('ru');
    });
});
