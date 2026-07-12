// #region Imports
// Node
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

// h3
import { createApp, defineEventHandler, toNodeListener } from 'h3';

// Vitest
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// Utils
import { createDevProxyEventHandler } from '../src/runtime/server/utils/devProxyHandler';
// #endregion

/**
 * Интеграционные тесты devProxy на реальных сокетах: контракт передачи
 * (метод/query/body/статус/заголовки в обе стороны), включая два отклонения
 * h3 proxyRequest, компенсируемых handler'ом: восстановление `accept`
 * (ignoredHeaders h3) и `redirect: 'manual'` (fetch по умолчанию разворачивал
 * бы 3xx в финальный ответ без Location).
 */

// #region Test servers
interface IEchoPayload {
    method: string;
    url: string;
    accept: string | null;
    cookie: string | null;
    authorization: string | null;
    contentType: string | null;
    body: string;
}

let upstream: Server;
let upstreamOrigin: string;

/** Прокси-приложения: basic-auth режим (дефолт тестов) и database-режим. */
let proxyBasic: Server;
let proxyBasicOrigin: string;
let proxyDatabase: Server;
let proxyDatabaseOrigin: string;
/** Прокси на мёртвый upstream (закрытый порт) — проверка стабильного 502. */
let proxyDead: Server;
let proxyDeadOrigin: string;

/**
 * Echo-upstream: /api/redirect отвечает 302, /api/slow не отвечает никогда
 * (таймаут-тест), остальные пути — JSON с зеркалом запроса.
 */
function handleUpstreamRequest(req: IncomingMessage, res: ServerResponse): void {
    if (req.url?.startsWith('/api/redirect')) {
        res.writeHead(302, { location: '/final', 'x-upstream': 'yes' });
        res.end();
        return;
    }

    if (req.url?.startsWith('/api/slow')) {
        return; // соединение остаётся открытым — closeAllConnections в afterAll
    }

    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
        const payload: IEchoPayload = {
            method: req.method ?? '',
            url: req.url ?? '',
            accept: req.headers.accept ?? null,
            cookie: req.headers.cookie ?? null,
            authorization: req.headers.authorization ?? null,
            contentType: req.headers['content-type'] ?? null,
            body: Buffer.concat(chunks).toString('utf8'),
        };
        res.writeHead(200, { 'content-type': 'application/json', 'x-upstream': 'yes' });
        res.end(JSON.stringify(payload));
    });
}

/**
 * Поднимает http-сервер на эфемерном порту и возвращает его origin.
 */
async function listen(server: Server): Promise<string> {
    await new Promise<void>((resolve) => {
        server.listen(0, '127.0.0.1', () => resolve());
    });
    const { port } = server.address() as AddressInfo;
    return `http://127.0.0.1:${port}`;
}

/**
 * Собирает h3-приложение: devProxy handler + локальный fallback «local».
 *
 * @param proxyUrl - Upstream base URL (важно: без завершающего слэша — кейс бывшего 502).
 * @param authMode - Auth-режим bricks.
 * @param timeoutMs - Таймаут upstream-запроса.
 */
function createProxyApp(proxyUrl: string, authMode: string, timeoutMs?: number): Server {
    const app = createApp();
    app.use(createDevProxyEventHandler({ proxyUrl, authMode, timeoutMs }));
    app.use(defineEventHandler(() => 'local'));
    return createServer(toNodeListener(app));
}

beforeAll(async () => {
    upstream = createServer(handleUpstreamRequest);
    upstreamOrigin = await listen(upstream);

    proxyBasic = createProxyApp(upstreamOrigin, 'basic', 500);
    proxyBasicOrigin = await listen(proxyBasic);

    proxyDatabase = createProxyApp(upstreamOrigin, 'database', 500);
    proxyDatabaseOrigin = await listen(proxyDatabase);

    // Порт мёртвого upstream: поднимаем и сразу закрываем — порт гарантированно ничей
    const throwaway = createServer((_request, response) => response.end());
    const deadOrigin = await listen(throwaway);
    await new Promise<void>((resolve, reject) => {
        throwaway.close((error) => {
            if (error) {
                reject(error);
            } else {
                resolve();
            }
        });
    });
    proxyDead = createProxyApp(deadOrigin, 'basic', 500);
    proxyDeadOrigin = await listen(proxyDead);
});

afterAll(async () => {
    for (const server of [proxyBasic, proxyDatabase, proxyDead, upstream]) {
        server.closeAllConnections();
        await new Promise<void>((resolve) => {
            server.close(() => resolve());
        });
    }
});
// #endregion

describe('devProxy: контракт передачи запроса', () => {
    it('GET с query проксируется; PROXY_URL без завершающего слэша валиден', async () => {
        const response = await fetch(`${proxyBasicOrigin}/api/items?x=1&y=2`);
        expect(response.status).toBe(200);
        expect(response.headers.get('x-upstream')).toBe('yes');

        const echo = (await response.json()) as IEchoPayload;
        expect(echo.method).toBe('GET');
        expect(echo.url).toBe('/api/items?x=1&y=2');
    });

    it('accept клиента доезжает до upstream (h3 глушит его без восстановления)', async () => {
        const response = await fetch(`${proxyBasicOrigin}/api/items`, {
            headers: { accept: 'application/vnd.test+json' },
        });
        const echo = (await response.json()) as IEchoPayload;
        expect(echo.accept).toBe('application/vnd.test+json');
    });

    it('POST сохраняет body и content-type', async () => {
        const response = await fetch(`${proxyBasicOrigin}/api/items`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: '{"a":1}',
        });
        const echo = (await response.json()) as IEchoPayload;
        expect(echo.method).toBe('POST');
        expect(echo.contentType).toBe('application/json');
        expect(echo.body).toBe('{"a":1}');
    });

    it('3xx upstream отдаётся клиенту как есть — статус и Location не разворачиваются', async () => {
        const response = await fetch(`${proxyBasicOrigin}/api/redirect`, {
            redirect: 'manual',
        });
        expect(response.status).toBe(302);
        expect(response.headers.get('location')).toBe('/final');
    });
});

describe('devProxy: identity билдера', () => {
    it('cookie bricks-session вырезается, остальные cookie доезжают', async () => {
        const response = await fetch(`${proxyBasicOrigin}/api/items`, {
            headers: { cookie: 'bricks-session=secret-token; project=keep-me' },
        });
        const echo = (await response.json()) as IEchoPayload;
        expect(echo.cookie).toBe('project=keep-me');
    });

    it('Authorization вырезается в basic-режиме', async () => {
        const response = await fetch(`${proxyBasicOrigin}/api/items`, {
            headers: { authorization: 'Basic Zm9vOmJhcg==' },
        });
        const echo = (await response.json()) as IEchoPayload;
        expect(echo.authorization).toBeNull();
    });

    it('Authorization доезжает в database-режиме (креды проекта, не bricks)', async () => {
        const response = await fetch(`${proxyDatabaseOrigin}/api/items`, {
            headers: { authorization: 'Bearer project-token' },
        });
        const echo = (await response.json()) as IEchoPayload;
        expect(echo.authorization).toBe('Bearer project-token');
    });
});

describe('devProxy: локальные пути и отказы upstream', () => {
    it('/api/bricks/** и /mock-api/** не проксируются', async () => {
        for (const path of ['/api/bricks', '/api/bricks/health', '/mock-api/s3-media-proxy']) {
            const response = await fetch(`${proxyBasicOrigin}${path}`);
            expect(response.headers.get('x-upstream')).toBeNull();
            expect(await response.text()).toBe('local');
        }
    });

    it('не-API пути не проксируются', async () => {
        const response = await fetch(`${proxyBasicOrigin}/bricks`);
        expect(await response.text()).toBe('local');
    });

    it('мёртвый upstream → стабильный 502', async () => {
        const response = await fetch(`${proxyDeadOrigin}/api/items`);
        expect(response.status).toBe(502);
    });

    it('зависший upstream → 502 по таймауту', async () => {
        const response = await fetch(`${proxyBasicOrigin}/api/slow`);
        expect(response.status).toBe(502);
    });
});
