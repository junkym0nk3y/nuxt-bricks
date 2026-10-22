/**
 * The cookie of the interface language of the builder.
 *
 * Written by the language switch alone and read on the builder and preview routes
 * alone. The cookie used to belong to the browser-language detection of `@nuxtjs/i18n`,
 * which writes it into every SSR response of the application: the published pages of
 * the host went out with a `Set-Cookie`, and a proxy cache in front of the host
 * (nginx skips a response that sets a cookie) stopped caching any of its HTML.
 */
export const BUILDER_LOCALE_COOKIE = 'bricks-locale';

/** A year of cookie life: a person picks the interface language once */
export const BUILDER_LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/** The language of the builder when the application runs in a locale bricks has no translations for */
export const BUILDER_FALLBACK_LOCALE = 'ru';

/**
 * Key of the state that remembers the locale of the host while the builder overrides
 * it. The state travels in the payload, so a client transition out of the builder
 * restores the locale the server resolved before the builder applied its own.
 */
export const BUILDER_HOST_LOCALE_STATE = 'bricks-builder-host-locale';
