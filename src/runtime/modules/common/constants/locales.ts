/**
 * Locales the interface of bricks ships translations for (`runtime/locales/<file>`).
 *
 * The build registers them in `@nuxtjs/i18n`, and the builder never applies any other
 * locale of the application: a locale the host adds for its own pages has no bricks
 * messages, and i18n runs without a fallback locale, so the builder would print its
 * raw keys.
 */
export const BRICKS_LOCALES = [
    { code: 'ru' as const, language: 'ru-RU', file: 'ru.json' },
    { code: 'en' as const, language: 'en-US', file: 'en.json' },
];

/** Codes of `BRICKS_LOCALES` */
export const BRICKS_LOCALE_CODES: readonly string[] = BRICKS_LOCALES.map(({ code }) => code);
