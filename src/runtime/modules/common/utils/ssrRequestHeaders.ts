/**
 * Заголовки входящего SSR-запроса, которые API-клиент билдера пробрасывает
 * дальше, и граница «локальные ручки vs внешний endpoint».
 *
 * Правило вынесено чистыми функциями, потому что у него два противоположных
 * края и оба обязательны:
 * - identity билдера (cookie сессии database-auth и `Authorization`
 *   basic-режима) — секрет инсталляции, внешнему сервису он не предназначен;
 * - та же identity обязательна локальным `/api/bricks/**`: editorial API
 *   защищён целиком, и без неё SSR билдера получает на них 401 (превью
 *   отдавало страницу статусом 401, дашборд деградировал в спиннер).
 */

// #region Imports
// Types
import type { IncomingHttpHeaders } from 'http';

// Utils
import { stripCookieByName } from './cookieHeader';

// Constants
import { BRICKS_SESSION_COOKIE_NAME } from '../constants/auth';
// #endregion

// #region Data
/**
 * Заголовки, пробрасываемые из SSR-запроса в API-запрос: адрес клиента для
 * серверных лимитов и identity запроса.
 */
const FORWARDED_HEADERS: string[] = [
    'x-real-ip',
    'x-forwarded-for',
    'x-forwarded-host',
    'x-forwarded-port',
    'x-forwarded-proto',
    'cookie',
    'authorization',
];

/**
 * Identity билдера: заголовки, которые `toExternalHeaders` снимает и которые
 * поэтому нужно вернуть локальным ручкам в исходном виде. Один список на оба
 * действия — иначе снятое из дефолтов молча теряется и на локальных ручках.
 */
const IDENTITY_HEADERS: string[] = ['cookie', 'authorization'];
// #endregion

// #region Methods
/**
 * Собирает пробрасываемые заголовки из входящего SSR-запроса.
 *
 * @param reqHeaders - Заголовки входящего запроса (вне SSR отсутствуют).
 * @returns Только пробрасываемые заголовки, в нижнем регистре имён.
 */
export function pickForwardedHeaders(
    reqHeaders: IncomingHttpHeaders | undefined
): Record<string, string> {
    if (!reqHeaders) {
        return {};
    }

    return FORWARDED_HEADERS.reduce((result: Record<string, string>, header: string) => {
        const value = reqHeaders[header];

        if (value) {
            result[header] = <string>value;
        }

        return result;
    }, {});
}

/**
 * Возвращает копию заголовков без identity билдера: cookie сессии и
 * `Authorization`. Basic-креды браузер после первого challenge шлёт на все
 * пути origin, включая SSR-документ, — наружу им нельзя, у внешнего сервиса
 * своя авторизация. Остальные cookie и заголовки проекта проходят как есть.
 *
 * Результат — дефолтные заголовки клиента: они уходят с КАЖДЫМ запросом, в том
 * числе на абсолютный URL чужого origin (для такого URL ofetch не применяет
 * baseURL, а заголовки применяет). Поэтому граница здесь fail-closed: identity
 * не наследуется никем, а локальным `/api/bricks/**` возвращается адресно.
 *
 * Снятие безусловное, не по auth-режиму. Dev-прокси снимает `Authorization`
 * только в basic (`devProxyHandler.ts`), исходя из того, что в database-режиме
 * заголовок принадлежит проекту-хосту, — но режим авторизации bricks
 * происхождение заголовка не доказывает: это может быть и Basic
 * инфраструктуры перед инсталляцией. Инвариант формулируется по источнику, а
 * не по режиму: identity, захваченная из входящего SSR-запроса, наружу не
 * уходит. Явные креды, переданные вызывающим в опциях запроса, под запрет не
 * попадают — ofetch домешивает их поверх дефолтов.
 *
 * @param headers - Заголовки, собранные из SSR-запроса.
 * @returns Заголовки, безопасные для любого endpoint.
 */
export function toExternalHeaders(headers: Record<string, string>): Record<string, string> {
    const externalHeaders = { ...headers };

    delete externalHeaders.authorization;

    if (externalHeaders.cookie) {
        const cookie = stripCookieByName(externalHeaders.cookie, BRICKS_SESSION_COOKIE_NAME);

        if (cookie) {
            externalHeaders.cookie = cookie;
        } else {
            delete externalHeaders.cookie;
        }
    }

    return externalHeaders;
}

/**
 * Возвращает identity-заголовки в исходном виде — для адресного добавления к
 * запросам к локальным ручкам: в дефолтных заголовках клиента их нет.
 *
 * @param headers - Заголовки, собранные из SSR-запроса.
 * @returns Только identity-заголовки, присутствующие в запросе.
 */
export function pickIdentityHeaders(headers: Record<string, string>): Record<string, string> {
    return IDENTITY_HEADERS.reduce((result: Record<string, string>, header: string) => {
        if (headers[header]) {
            result[header] = headers[header];
        }

        return result;
    }, {});
}
// #endregion
