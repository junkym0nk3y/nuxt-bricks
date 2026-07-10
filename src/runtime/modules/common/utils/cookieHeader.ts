/**
 * Работа со значением HTTP-заголовка Cookie (строка пар RFC 6265).
 *
 * Используется при проксировании запросов на внешний backend (PROXY_URL):
 * cookie сессии bricks — секрет билдера и внешнему сервису не предназначена,
 * остальные cookie проекта пробрасываются как есть.
 */

/**
 * Возвращает значение заголовка Cookie без пары с указанным именем.
 * Прочие пары сохраняются в исходном порядке; если после фильтрации
 * пар не осталось — возвращает пустую строку (заголовок не отправлять).
 *
 * @param cookieHeader - Исходное значение заголовка Cookie.
 * @param cookieName - Точное имя вырезаемой cookie (регистрозависимое).
 */
export function stripCookieByName(cookieHeader: string, cookieName: string): string {
    return cookieHeader
        .split(';')
        .map((pair) => pair.trim())
        .filter((pair) => {
            if (!pair) {
                return false;
            }

            const separatorIndex = pair.indexOf('=');
            const name = separatorIndex === -1 ? pair : pair.slice(0, separatorIndex).trim();

            return name !== cookieName;
        })
        .join('; ');
}
