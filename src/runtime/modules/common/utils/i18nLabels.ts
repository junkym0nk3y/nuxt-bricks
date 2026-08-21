// #region Types
/**
 * The translation function (`t` of vue-i18n / `$i18n.t`).
 *
 * The second parameter is optional: captions without substitutions call it with one
 * argument while the media summaries call it with parameters, and both calls have to be
 * described by one type, otherwise a second copy of the signature appears at the call
 * site.
 */
export type TTranslateFn = (key: string, params?: Record<string, string | number>) => string;

/** Check for the presence of a key in the current locale (`te` of vue-i18n) */
export type TTranslateExistsFn = (key: string) => boolean;
// #endregion

/**
 * Resolves a label or a description out of the brick and block definitions: the
 * `bricks.*` keys are translated, arbitrary strings (the consumer's custom .brick.ts)
 * are returned as they are.
 *
 * `te()` does not look into the fallback locale, so for the `bricks.*` keys absent
 * from the current locale the translation is called unconditionally — vue-i18n applies
 * the fallback chain itself.
 *
 * @param t - Translation function.
 * @param te - Check for the presence of a key in the current locale.
 * @param raw - Raw value from the definition (a key or a ready string).
 */
export function resolveBricksLabel(
    t: TTranslateFn,
    te: TTranslateExistsFn,
    raw?: string
): string | undefined {
    if (!raw) {
        return raw;
    }

    if (te(raw)) {
        return t(raw);
    }

    if (raw.startsWith('bricks.')) {
        return t(raw);
    }

    return raw;
}
