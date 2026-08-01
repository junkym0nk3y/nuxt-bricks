// #region Imports
// Vitest
import { describe, expect, it } from 'vitest';

// Constants
import { BRICKS_SESSION_COOKIE_NAME } from '../../src/runtime/modules/common/constants/auth';

// Utils
import {
    pickForwardedHeaders,
    pickIdentityHeaders,
    toExternalHeaders,
} from '../../src/runtime/modules/common/utils/ssrRequestHeaders';
// #endregion

/**
 * Заголовки SSR-запроса живут на границе с двумя обязательными краями: identity
 * инсталляции нужна локальному editorial API (без неё превью в basic-режиме
 * отдавало страницу статусом 401) и не должна уехать во внешний сервис.
 */

const incomingHeaders = {
    authorization: 'Basic YWRtaW46c2VjcmV0',
    cookie: `csrftoken=abc; ${BRICKS_SESSION_COOKIE_NAME}=session-secret; sessionid=xyz`,
    'x-forwarded-for': '203.0.113.7',
    host: 'example.test',
};

describe('заголовки SSR-запроса для API-клиента билдера', () => {
    it('пробрасывает identity запроса и адрес клиента, прочие заголовки не берёт', () => {
        expect(pickForwardedHeaders(incomingHeaders)).toEqual({
            authorization: incomingHeaders.authorization,
            cookie: incomingHeaders.cookie,
            'x-forwarded-for': '203.0.113.7',
        });
    });

    it('снимает для внешнего endpoint Authorization целиком, а из cookie — сессию билдера', () => {
        const external = toExternalHeaders(pickForwardedHeaders(incomingHeaders));

        expect(external).toEqual({
            cookie: 'csrftoken=abc; sessionid=xyz',
            'x-forwarded-for': '203.0.113.7',
        });
    });

    // Оба списка — снятие для внешнего и восстановление для локальных ручек —
    // обязаны совпадать: заголовок, снятый в одном и забытый в другом, молча
    // потеряется на локальном editorial API, то есть вернёт тот же 401
    it('возвращает локальным ручкам ровно то, что снято для внешнего endpoint', () => {
        const headers = pickForwardedHeaders(incomingHeaders);
        const external = toExternalHeaders(headers);
        const identity = pickIdentityHeaders(headers);

        const strippedNames = Object.keys(headers).filter(
            (name) => external[name] !== headers[name]
        );

        expect(strippedNames.sort()).toEqual(Object.keys(identity).sort());
        strippedNames.forEach((name) => {
            expect(identity[name]).toBe(headers[name]);
        });
    });
});
