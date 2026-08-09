// #region Types
/**
 * Функция перевода (`t` из vue-i18n / `$i18n.t`).
 *
 * Второй параметр опционален: подписи без подстановок вызывают её одним
 * аргументом, а сводки медиа — с параметрами, и оба вызова обязаны описываться
 * одним типом, иначе у вызывающего появляется вторая копия сигнатуры.
 */
export type TTranslateFn = (key: string, params?: Record<string, string | number>) => string;

/** Проверка наличия ключа в текущей локали (`te` из vue-i18n). */
export type TTranslateExistsFn = (key: string) => boolean;
// #endregion

/**
 * Резолвит label/description из brick/block definitions: ключи `bricks.*`
 * переводятся, произвольные строки (кастомные .brick.ts потребителя)
 * возвращаются как есть.
 *
 * `te()` не смотрит в fallback-локаль, поэтому для ключей `bricks.*`,
 * отсутствующих в текущей локали, перевод вызывается безусловно —
 * vue-i18n сам применит fallback-цепочку.
 *
 * @param t - Функция перевода.
 * @param te - Проверка наличия ключа в текущей локали.
 * @param raw - Сырое значение из definition (ключ или готовая строка).
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
