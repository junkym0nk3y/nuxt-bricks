// #region Imports
// Vitest
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Utils
import { createFetch } from 'ofetch';
// #endregion

/**
 * Граница «identity инсталляции уходит только на локальные `/api/bricks/**`».
 * Оба края ломаются молча: без identity editorial API отвечает SSR-запросам 401
 * (превью отдавало страницу этим статусом), а identity, доступная запросу к
 * чужому origin, утекает наружу — `baseURL` к абсолютному URL не применяется, а
 * заголовки применяются.
 *
 * Проверяется композабл на настоящем инстансе ofetch с подменённым низкоуровневым
 * `fetch`: слияние дефолтных и вызывных заголовков, порядок хуков и построение
 * конечного URL — поведение транспорта, а не арифметика стаба. Ради этого спека и
 * существует: связка жила в хуке `onRequest`, и её удаление не краснило ни одну
 * спеку набора.
 */

// #region Mocks
const FULL_COOKIE = 'csrftoken=abc; bricks-session=session-secret; project-session=xyz';
const PROJECT_COOKIE = 'csrftoken=abc; project-session=xyz';
const INSTALLATION_CREDS = 'Basic INSTALLATION-CREDS';

/** Заголовки входящего SSR-запроса — кейсы подменяют их до вызова композабла. */
let incomingHeaders: Record<string, string> = {};

vi.mock('#imports', async (importOriginal) => {
    const actual = await importOriginal<Record<string, unknown>>();

    return {
        ...actual,
        useRequestEvent: () => ({ node: { req: { headers: incomingHeaders } } }),
        useRuntimeConfig: () => ({ app: { baseURL: '/' }, public: {} }),
    };
});
// #endregion

import { useApiClient } from '../../src/runtime/modules/common/composables/useApiClient';

const CLIENT_ORIGIN = 'http://localhost:3000';
const FOREIGN_URL = 'https://other-origin.test/api/thing';
// Вне SSR база локальных ручек строится от origin (на сервере она относительная —
// там `$fetch` зовёт обработчик Nitro напрямую, без сети)
const LOCAL_BASE_URL = `${CLIENT_ORIGIN}/`;

let sentRequests: Array<{ url: string; headers: Headers }> = [];
/** Префикс URL, на который транспорт отвечает 500 (кейсу с повтором нужен отказ). */
let failingUrlPrefix = '';
/** `baseURL`, с которым обёртка отдала запрос транспорту (до разрешения URL). */
let requestedBaseUrls: Array<string | undefined> = [];

/**
 * Ставит `globalThis.$fetch` настоящим ofetch поверх подменённого `fetch`.
 * Клиент билдера строится через `$fetch.create`, поэтому инстанс обязан быть
 * живым: слияние заголовков, порядок хуков и разрешение URL проверяются на
 * реальном ofetch.
 *
 * `.raw` инстанса обёрнут записью опций: конечный URL не отличает «endpoint
 * переключён на локальный» от «endpoint и так был локальным» — в тестах
 * `import.meta.server` ложно, поэтому внешний endpoint недостижим, и само
 * переключение видно только в опциях запроса.
 */
function installFetchTransport(): void {
    sentRequests = [];
    requestedBaseUrls = [];
    failingUrlPrefix = '';

    const fakeFetch = vi.fn((url: URL | RequestInfo, init: RequestInit = {}) => {
        const target = String(url);
        sentRequests.push({ url: target, headers: new Headers(init.headers) });

        return Promise.resolve(
            new Response('{}', {
                // Отказ локальной ручки — повод для повтора: кейсу с retry нужен
                // именно он, остальным путям хватает 200
                status: failingUrlPrefix && target.startsWith(failingUrlPrefix) ? 500 : 200,
                headers: { 'content-type': 'application/json' },
            })
        );
    });

    const transport = createFetch({ fetch: fakeFetch, Headers, AbortController });

    Object.assign(globalThis, {
        $fetch: {
            ...transport,
            create: (defaults: Parameters<typeof transport.create>[0]) => {
                const instance = transport.create(defaults);
                const originalRaw = instance.raw.bind(instance);
                const raw: typeof instance.raw = (request, options) => {
                    requestedBaseUrls.push(options?.baseURL);

                    return originalRaw(request, options);
                };

                return Object.assign(instance, { raw });
            },
        },
        window: { location: { origin: CLIENT_ORIGIN, pathname: '/', search: '' } },
    });
}

describe('identity инсталляции в запросах API-клиента билдера', () => {
    beforeEach(() => {
        incomingHeaders = { authorization: INSTALLATION_CREDS, cookie: FULL_COOKIE };
        installFetchTransport();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('локальная ручка получает identity, локальный URL и заголовки вызывающего', async () => {
        const { apiFetcher } = useApiClient();
        await apiFetcher('/api/bricks/', {
            headers: { accept: 'application/json', Authorization: 'Bearer CALLER-TOKEN' },
        });

        const [sent] = sentRequests;

        expect(sent.url).toBe(`${CLIENT_ORIGIN}/api/bricks/`);
        // Локальные ручки уходят на Nuxt-сервер независимо от настроенного
        // endpoint'а: при заданном PROXY_URL без переключения запрос ушёл бы к
        // API host-проекта
        expect(requestedBaseUrls[0]).toBe(LOCAL_BASE_URL);
        // Identity перебивает одноимённый заголовок вызывающего (регистр не в
        // счёт): локальная ручка авторизуется кредами инсталляции, а не токеном,
        // который вызывающий приготовил для внешнего сервиса
        expect(sent.headers.get('authorization')).toBe(INSTALLATION_CREDS);
        expect(sent.headers.get('cookie')).toBe(FULL_COOKIE);
        // Заголовки вызывающего и дефолты клиента переживают добавление identity:
        // `set` точечный, а не замена набора. Без CSRF-маркера unsafe-запросы
        // bricks-API отклоняет гейт
        expect(sent.headers.get('accept')).toBe('application/json');
        expect(sent.headers.get('x-bricks-csrf')).toBe('1');
    });

    it('чужой origin и не-bricks путь identity не получают, свои креды вызывающего сохраняются', async () => {
        const { apiFetcher } = useApiClient();
        await apiFetcher(FOREIGN_URL, { headers: { authorization: 'Bearer CALLER-TOKEN' } });
        await apiFetcher('/api/project/thing');

        const [foreign, project] = sentRequests;

        expect(foreign.url).toBe(FOREIGN_URL);
        expect(foreign.headers.get('authorization')).toBe('Bearer CALLER-TOKEN');
        expect(foreign.headers.get('cookie')).toBe(PROJECT_COOKIE);

        expect(project.headers.get('authorization')).toBeNull();
        expect(project.headers.get('cookie')).toBe(PROJECT_COOKIE);
        // Не-bricks путям endpoint не подменяется — их адрес решает конфигурация
        expect(requestedBaseUrls).toEqual([undefined, undefined]);
    });

    // Хук запроса вызывающего ofetch зовёт ПОСЛЕ обёртки и до построения URL,
    // откуда он уводит уже авторизованный запрос на чужой origin — и через
    // `options.baseURL`, и переписав сам `request` (оба способа проверены на
    // ofetch 1.5.1). Поэтому хук не поддерживается и снимается
    it('хук запроса вызывающего не уводит авторизованный запрос на чужой origin', async () => {
        const { apiFetcher } = useApiClient();
        const callerHook = vi.fn((context: { request: string; options: { baseURL?: string } }) => {
            context.options.baseURL = 'https://foreign.test/';
            context.request = 'https://foreign.test/steal';
        });

        // Вызов в обход типа: `TApiRequestOptions` хук запрещает, но
        // нетипизированный код тип не остановит — снятие обязано работать в рантайме
        const untypedFetcher = apiFetcher as (
            request: string,
            options: unknown
        ) => Promise<unknown>;
        await untypedFetcher('/api/bricks/', { onRequest: callerHook });

        const [sent] = sentRequests;

        expect(callerHook).not.toHaveBeenCalled();
        expect(sent.url).toBe(`${CLIENT_ORIGIN}/api/bricks/`);
        expect(sent.headers.get('authorization')).toBe(INSTALLATION_CREDS);
    });

    // Хуки ответа исполняются перед повтором и тоже переписывают адрес, а
    // call-level `retry` перебивает `retry: 0` инстанса — повтор уходит с теми же
    // заголовками, то есть с identity (проверено на ofetch 1.5.1: креды доехали
    // до чужого origin). Поэтому политика повторов и хуки принадлежат клиенту
    it('повтор с хуком ответа не уносит identity на чужой origin', async () => {
        failingUrlPrefix = CLIENT_ORIGIN;

        const { apiFetcher } = useApiClient();
        const untypedFetcher = apiFetcher as (
            request: string,
            options: unknown
        ) => Promise<unknown>;

        await expect(
            untypedFetcher('/api/bricks/', {
                retry: 1,
                retryDelay: 0,
                onResponseError: (context: { request: string }) => {
                    context.request = 'https://foreign.test/steal';
                },
            })
        ).rejects.toThrow();

        // Ровно одна попытка и ни одного запроса за пределы локального origin
        expect(sentRequests).toHaveLength(1);
        expect(sentRequests[0].url).toBe(`${CLIENT_ORIGIN}/api/bricks/`);
    });

    it('локальный путь остаётся локальным и без identity во входящем запросе', async () => {
        // Публичные ручки бывают без identity (health, components): маршрутизация
        // не должна зависеть от её наличия — иначе при внешнем endpoint такой
        // запрос ушёл бы на host-проекта
        incomingHeaders = {};

        const { apiFetcher } = useApiClient();
        await apiFetcher('/api/bricks/components');

        const [sent] = sentRequests;

        expect(requestedBaseUrls[0]).toBe(LOCAL_BASE_URL);
        expect(sent.url).toBe(`${CLIENT_ORIGIN}/api/bricks/components`);
        expect(sent.headers.get('authorization')).toBeNull();
    });
});
