/**
 * Приведение и проверка адреса ссылки, введённого в модалке текстового редактора.
 * Чистые функции без DOM — та же политика, что у санитайзера рендера
 * (`common/utils/sanitize/urlPolicy`), но применённая на входе, чтобы автор
 * увидел отказ сразу, а не обнаружил вырезанный href на published-странице.
 */

// #region Imports
// Utils
import { isSafeLinkUrl } from '../../common/utils/sanitize/urlPolicy';
// #endregion

// #region Constants
/** Схема в начале значения (`https:`, `mailto:`, `javascript:`). */
const SCHEME_PREFIX = /^[a-z][a-z0-9+.-]*:/i;

/** Протокол, дописываемый голому домену (`example.com` → `https://example.com`). */
const DEFAULT_SCHEME = 'https://';

/**
 * rel для ссылок, открываемых в новой вкладке. `noopener` отрезает доступ
 * открытой страницы к `window.opener`, `noreferrer` — утечку адреса источника.
 */
export const NEW_TAB_LINK_REL = 'noopener noreferrer';
// #endregion

// #region Utils
/**
 * Приводит введённый адрес к виду, который переживёт санитайзер рендера.
 * Голый домен получает `https://` — иначе `example.com` уехал бы в схему
 * относительного пути и вёл бы на несуществующую страницу самого сайта.
 *
 * @param raw - Значение поля ввода как есть.
 * @returns Нормализованный адрес либо null, если он запрещён политикой ссылок.
 */
export function normalizeLinkHref(raw: string): string | null {
    const trimmed = raw.trim();

    if (!trimmed) {
        return null;
    }

    const hasExplicitTarget =
        SCHEME_PREFIX.test(trimmed) || trimmed.startsWith('#') || trimmed.startsWith('/');
    const candidate = hasExplicitTarget ? trimmed : `${DEFAULT_SCHEME}${trimmed}`;

    return isSafeLinkUrl(candidate) ? candidate : null;
}
// #endregion
