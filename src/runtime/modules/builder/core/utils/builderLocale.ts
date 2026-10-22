import { BRICKS_LOCALE_CODES } from '../../../common/constants/locales';
import { BUILDER_FALLBACK_LOCALE } from '../constants/locale';

/**
 * Picks the interface language of a builder or preview route: the one the person has
 * chosen with the switch, otherwise the current locale, which on the first request is the
 * default locale of the application (`bricks.i18n.defaultLocale`, Russian unless set).
 * Only a locale bricks has translations for is ever picked — when the current one belongs
 * to the host alone, the builder falls back to Russian.
 *
 * The language of the browser is not asked: the builder opens in the default language
 * until the switch says otherwise. It used to follow the browser, and an English browser
 * opened a Russian-speaking team the English interface and a documentation that has no
 * English articles.
 *
 * Nothing is written on the way: the cookie appears only when the switch is used.
 *
 * @param saved - Value of the language cookie, as read.
 * @param current - The locale i18n has applied so far.
 * @returns The locale the builder has to show.
 */
export function pickBuilderLocale(saved: unknown, current: string): string {
    if (typeof saved === 'string' && BRICKS_LOCALE_CODES.includes(saved)) {
        return saved;
    }

    return BRICKS_LOCALE_CODES.includes(current) ? current : BUILDER_FALLBACK_LOCALE;
}
