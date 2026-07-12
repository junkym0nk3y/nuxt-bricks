#!/usr/bin/env node
/**
 * Nitro-level smoke external-режима data backend (ре-ревью PR2 плана
 * backend-connection-modes): production-like проверка ВСЕЙ связки, которую
 * не покрывают unit/vitest-смоки (те собирают адаптер и publish-фейк руками):
 * module setup → registry → Nitro-плагин externalBackendStorage → локальные
 * handlers `/api/bricks/**` (включая multipart upload) → HttpStorageAdapter →
 * fake external backend.
 *
 * Поток: npm pack → чистый consumer (backend.mode = 'external', in-memory
 * publish adapter через setBricksPublishAdapter) → nuxi build → boot с
 * NUXT_BRICKS_BACKEND_URL/TOKEN → lifecycle против fake external backend
 * (in-process node http-сервер): readiness (adapter-путь), page CRUD +
 * publish, public lookup, multipart upload (sharp в consumer) → external
 * получает ТОЛЬКО JSON metadata с Bearer, media delete. Отдельные boot'ы
 * проверяют, что NUXT_BRICKS_BACKEND_MODE НЕ переключает режим (mode —
 * build-time регистрация плагина, а не runtimeConfig) и что runtime-env
 * NUXT_BRICKS_AUTH_MODE=database в external-сборке отвечает 503 (runtime-defense
 * auth middleware). Между boot'ами скрипт ждёт exit предыдущего процесса —
 * иначе гонка за порт делает проверку ложноположительной.
 *
 * Использование: npm run smoke:external
 * Временная папка удаляется при успехе и сохраняется при ошибке (путь в логе).
 */
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { assertOk, bootServer, run, runCapture, waitForExit } from './smoke-shared.mjs';
import { BACKEND_BASE_PATH, createFakeExternalBackend } from './external-smoke-backend.mjs';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SERVER_PORT = 4517;
const SERVER_ORIGIN = `http://127.0.0.1:${SERVER_PORT}`;
const BACKEND_PORT = 4518;
const BACKEND_URL = `http://127.0.0.1:${BACKEND_PORT}${BACKEND_BASE_PATH}`;
const BACKEND_TOKEN = 'external-smoke-token';
const BASIC_USERNAME = 'admin';
const BASIC_PASSWORD = 'external-smoke-secret';
const PAGE_MARKER = 'bricks-external-smoke-ok';
const PAGENAME = 'external-smoke-page';
// In-memory publish adapter consumer'а — binary никогда не уходит на backend
const MEMORY_STORAGE_BASE = 'https://memory-storage.invalid/bucket/';
// Валидный 1x1 PNG: sharp в consumer обязан его декодировать и сконвертировать
const PNG_BASE64 =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

/**
 * Заголовки авторизованного запроса; unsafe-методы проходят CSRF-гейт
 * кастомным заголовком x-bricks-csrf (аудит A-03).
 *
 * @returns {Record<string, string>} Заголовки.
 */
function authHeaders() {
    return {
        Authorization: `Basic ${Buffer.from(`${BASIC_USERNAME}:${BASIC_PASSWORD}`).toString('base64')}`,
        'x-bricks-csrf': '1',
    };
}

/**
 * Создаёт consumer-приложение external-режима: backend.mode в nuxt.config,
 * in-memory publish adapter — Nitro-плагином через nuxt-bricks/persistence.
 *
 * @param {string} consumerDir Папка consumer.
 * @param {string} tarballPath Абсолютный путь к tarball.
 * @returns {Promise<void>} Резолвится после записи файлов.
 */
async function scaffoldConsumer(consumerDir, tarballPath) {
    await mkdir(join(consumerDir, 'pages'), { recursive: true });
    await mkdir(join(consumerDir, 'server', 'plugins'), { recursive: true });
    await writeFile(
        join(consumerDir, 'package.json'),
        JSON.stringify(
            {
                name: 'bricks-external-smoke-consumer',
                private: true,
                type: 'module',
                dependencies: {
                    nuxt: '^3.21.1',
                    'nuxt-bricks': `file:${tarballPath}`,
                },
            },
            null,
            2
        )
    );
    await writeFile(
        join(consumerDir, 'nuxt.config.ts'),
        [
            'export default defineNuxtConfig({',
            "    modules: ['nuxt-bricks'],",
            "    compatibilityDate: '2025-01-01',",
            '    bricks: {',
            "        backend: { mode: 'external' }, // URL/token приходят на boot через NUXT_BRICKS_BACKEND_*",
            '    },',
            '});',
            '',
        ].join('\n')
    );
    await writeFile(
        join(consumerDir, 'server', 'plugins', 'memoryPublish.ts'),
        [
            "import { setBricksPublishAdapter } from 'nuxt-bricks/persistence';",
            '',
            `const STORAGE_BASE = '${MEMORY_STORAGE_BASE}';`,
            'const objects = new Map<string, number>();',
            '',
            '// In-memory publish adapter: файлы не покидают процесс consumer —',
            '// smoke доказывает, что на external backend уходят только metadata',
            'export default defineNitroPlugin(() => {',
            '    setBricksPublishAdapter({',
            '        buildFileKey(kind, filename) {',
            '            return `bricks-media/${kind}-${filename}`;',
            '        },',
            '        async uploadFile({ buffer, key }) {',
            '            const url = `${STORAGE_BASE}${key}`;',
            '            objects.set(url, buffer.length);',
            '            return { url, key, size: buffer.length };',
            '        },',
            '        async deleteFile(url) {',
            '            if (!url.startsWith(STORAGE_BASE)) {',
            "                throw new Error('URL outside managed storage');",
            '            }',
            '            objects.delete(url);',
            '        },',
            '        async listFiles() {',
            '            return [];',
            '        },',
            '        isOwnedUrl(url) {',
            '            return url.startsWith(STORAGE_BASE);',
            '        },',
            '    });',
            '});',
            '',
        ].join('\n')
    );
    await writeFile(
        join(consumerDir, 'pages', 'index.vue'),
        `<template>\n    <div>${PAGE_MARKER}</div>\n</template>\n`
    );
}

/**
 * Lifecycle против поднятого consumer-сервера и fake external backend.
 *
 * @param {ReturnType<typeof createFakeExternalBackend>} backend Fake backend.
 * @returns {Promise<void>} Резолвится при зелёном lifecycle.
 */
async function runLifecycle(backend) {
    // Readiness: external-режим идёт adapter-путём (probeHealth → GET {base})
    const ready = await fetch(`${SERVER_ORIGIN}/api/bricks/health/ready`);
    assertOk(ready.status === 200, `readiness external ожидался 200, получен ${ready.status}`);

    const anonymous = await fetch(`${SERVER_ORIGIN}/api/bricks`);
    assertOk(anonymous.status === 401, `аноним GET /api/bricks ожидался 401: ${anonymous.status}`);

    // Создание страницы через ЛОКАЛЬНУЮ ручку → HttpStorageAdapter → fake backend
    const created = await fetch(`${SERVER_ORIGIN}/api/bricks`, {
        method: 'POST',
        headers: { ...authHeaders(), 'content-type': 'application/json' },
        body: JSON.stringify({
            pagename: PAGENAME,
            title: 'External smoke',
            schema: { components: [] },
        }),
    });
    assertOk(created.ok, `POST /api/bricks ожидался 2xx, получен ${created.status}`);
    const createdPage = await created.json();
    assertOk(createdPage.pagename === PAGENAME, 'ответ create не содержит pagename');

    const backendCreate = backend.requests.find(
        (item) => item.method === 'POST' && item.path === BACKEND_BASE_PATH
    );
    assertOk(Boolean(backendCreate), 'fake backend не получил POST {base} создания страницы');

    const list = await fetch(`${SERVER_ORIGIN}/api/bricks`, { headers: authHeaders() });
    const summaries = await list.json();
    assertOk(
        Array.isArray(summaries) && summaries.some((item) => item.pagename === PAGENAME),
        'GET /api/bricks не вернул созданную страницу'
    );
    assertOk(
        summaries.every((item) => !('schema' in item)),
        'сводки списка не должны содержать schema'
    );

    // Публикация PATCH'ем страницы, затем public lookup (аноним)
    const published = await fetch(`${SERVER_ORIGIN}/api/bricks/${createdPage.id}`, {
        method: 'PATCH',
        headers: { ...authHeaders(), 'content-type': 'application/json' },
        body: JSON.stringify({ published: true }),
    });
    assertOk(published.ok, `PATCH published ожидался 2xx, получен ${published.status}`);

    const publicPage = await fetch(`${SERVER_ORIGIN}/api/bricks/public/pages/${PAGENAME}`);
    assertOk(publicPage.status === 200, `public lookup ожидался 200: ${publicPage.status}`);
    const projection = await publicPage.json();
    assertOk(projection.pagename === PAGENAME, 'public projection не содержит pagename');
    assertOk(
        !('thumbnailUrl' in projection) && !('revision' in projection),
        'public projection не должна содержать editor-only поля'
    );

    // Multipart upload: sharp обрабатывает файл в consumer, binary — в
    // in-memory publish adapter, на external уходит только JSON metadata
    const formData = new FormData();
    formData.append(
        'file',
        new Blob([Buffer.from(PNG_BASE64, 'base64')], { type: 'image/png' }),
        'smoke.png'
    );
    formData.append('category', 'image');
    const uploaded = await fetch(`${SERVER_ORIGIN}/api/bricks/media/upload`, {
        method: 'POST',
        headers: authHeaders(),
        body: formData,
    });
    assertOk(uploaded.ok, `media upload ожидался 2xx, получен ${uploaded.status}`);
    const media = await uploaded.json();
    assertOk(
        String(media.url).startsWith(MEMORY_STORAGE_BASE),
        `url медиа должен указывать в память consumer, получен ${media.url}`
    );
    assertOk(media.mimeType === 'image/webp', `sharp должен отдать webp: ${media.mimeType}`);

    const backendMedia = backend.requests.find(
        (item) => item.method === 'POST' && item.path === `${BACKEND_BASE_PATH}/media`
    );
    assertOk(Boolean(backendMedia), 'fake backend не получил POST {base}/media');
    assertOk(
        backendMedia.contentType === 'application/json',
        `metadata должны уходить JSON'ом, получен content-type ${backendMedia.contentType}`
    );
    assertOk(
        typeof backendMedia.body?.url === 'string' &&
            backendMedia.body.url.startsWith(MEMORY_STORAGE_BASE),
        'metadata на backend не содержат url файла из publish-хранилища'
    );

    // Удаление медиа: локальная оркестрация file-first, backend — только metadata
    const deleted = await fetch(`${SERVER_ORIGIN}/api/bricks/media/${media.id}`, {
        method: 'DELETE',
        headers: authHeaders(),
    });
    assertOk(deleted.ok, `media delete ожидался 2xx, получен ${deleted.status}`);
    assertOk(
        backend.requests.some(
            (item) =>
                item.method === 'DELETE' && item.path === `${BACKEND_BASE_PATH}/media/${media.id}`
        ),
        'fake backend не получил DELETE {base}/media/:id'
    );

    // Инварианты server-to-server транспорта — на ВСЕХ запросах к backend
    assertOk(backend.requests.length > 0, 'fake backend не получил ни одного запроса');
    for (const item of backend.requests) {
        assertOk(
            item.authorization === `Bearer ${BACKEND_TOKEN}`,
            `запрос ${item.method} ${item.path} без Bearer-токена: «${item.authorization}»`
        );
        assertOk(
            !item.contentType.startsWith('multipart/'),
            `binary/multipart не должен достигать external backend: ${item.method} ${item.path}`
        );
    }

    console.info('[external-smoke] Lifecycle зелёный');
}

/**
 * Проверяет, что NUXT_BRICKS_BACKEND_MODE не переключает режим после сборки:
 * consumer собран external'ом — с env-«переключением» на builtin запросы
 * обязаны по-прежнему идти на fake backend (mode — build-time регистрация
 * Nitro-плагина, в runtimeConfig ключа режима нет).
 *
 * @param {string} consumerDir Папка consumer.
 * @param {ReturnType<typeof createFakeExternalBackend>} backend Fake backend.
 * @returns {Promise<void>} Резолвится при подтверждённой неизменности режима.
 */
async function runModeImmutabilityCheck(consumerDir, backend) {
    const server = await bootServer(consumerDir, {
        port: SERVER_PORT,
        env: {
            NUXT_BASIC_AUTH_USERNAME: BASIC_USERNAME,
            NUXT_BASIC_AUTH_PASSWORD: BASIC_PASSWORD,
            NUXT_BRICKS_BACKEND_URL: BACKEND_URL,
            NUXT_BRICKS_BACKEND_TOKEN: BACKEND_TOKEN,
            // Попытка runtime-переключения режима — должна быть проигнорирована
            NUXT_BRICKS_BACKEND_MODE: 'builtin',
        },
    });
    try {
        const before = backend.requests.length;
        const list = await fetch(`${SERVER_ORIGIN}/api/bricks`, { headers: authHeaders() });
        assertOk(
            list.status === 200,
            `GET /api/bricks при env-попытке переключения ожидался 200 (external жив), получен ${list.status}`
        );
        assertOk(
            backend.requests.length > before,
            'запрос не дошёл до fake backend — env переключил режим (регрессия P2 ре-ревью)'
        );
        console.info('[external-smoke] NUXT_BRICKS_BACKEND_MODE игнорируется — режим build-time');
    } finally {
        server.kill('SIGKILL');
        await waitForExit(server);
    }
}

/**
 * Проверяет runtime-defense auth middleware: env-попытка включить database-auth
 * в external-сборке (обход build-time запрета auth.mode=database +
 * backend.mode=external) обязана отвечать 503 с указанием на external-режим,
 * а не работать против подсунутой БД.
 *
 * @param {string} consumerDir Папка consumer.
 * @returns {Promise<void>} Резолвится при подтверждённом отказе.
 */
async function runDatabaseAuthDefenseCheck(consumerDir) {
    const server = await bootServer(consumerDir, {
        port: SERVER_PORT,
        env: {
            NUXT_BRICKS_BACKEND_URL: BACKEND_URL,
            NUXT_BRICKS_BACKEND_TOKEN: BACKEND_TOKEN,
            // Попытка обойти build-time запрет database-auth в external-сборке
            NUXT_BRICKS_AUTH_MODE: 'database',
            NUXT_BRICKS_DATABASE_URL: 'postgres://smoke:smoke@127.0.0.1:5599/smoke',
        },
    });
    try {
        const response = await fetch(`${SERVER_ORIGIN}/api/bricks`);
        assertOk(
            response.status === 503,
            `database-auth в external-сборке ожидался 503, получен ${response.status}`
        );
        const body = await response.text();
        assertOk(
            body.includes('external backend mode'),
            'ожидался отказ именно external-defense (503 по недоступной БД — не та защита)'
        );
        console.info('[external-smoke] NUXT_BRICKS_AUTH_MODE=database отвергнут runtime-defense');
    } finally {
        server.kill('SIGKILL');
        await waitForExit(server);
    }
}

/**
 * Основной сценарий smoke-теста.
 *
 * @returns {Promise<void>} Резолвится при полном успехе.
 */
async function main() {
    const workDir = await mkdtemp(join(tmpdir(), 'bricks-external-smoke-'));
    console.info(`[external-smoke] Рабочая папка: ${workDir}`);
    const backend = createFakeExternalBackend();
    await new Promise((resolve) => {
        backend.server.listen(BACKEND_PORT, '127.0.0.1', () => resolve(undefined));
    });
    let server = null;
    try {
        console.info('[external-smoke] npm pack (prepack соберёт модуль)...');
        const packOutput = await runCapture(
            'npm',
            ['pack', '--pack-destination', workDir],
            REPO_ROOT
        );
        const tarballName = packOutput.trim().split('\n').at(-1)?.trim() ?? '';
        assertOk(tarballName.endsWith('.tgz'), `npm pack не вернул имя tarball: «${tarballName}»`);

        const consumerDir = join(workDir, 'consumer');
        await scaffoldConsumer(consumerDir, join(workDir, tarballName));

        console.info('[external-smoke] npm install в чистом consumer...');
        await run('npm', ['install', '--no-audit', '--no-fund'], { cwd: consumerDir });

        console.info('[external-smoke] nuxi build consumer-приложения...');
        await run('npx', ['nuxi', 'build'], {
            cwd: consumerDir,
            env: { NUXT_TELEMETRY_DISABLED: '1' },
        });

        console.info('[external-smoke] Boot прод-сервера (external-режим)...');
        server = await bootServer(consumerDir, {
            port: SERVER_PORT,
            env: {
                NUXT_BASIC_AUTH_USERNAME: BASIC_USERNAME,
                NUXT_BASIC_AUTH_PASSWORD: BASIC_PASSWORD,
                NUXT_BRICKS_BACKEND_URL: BACKEND_URL,
                NUXT_BRICKS_BACKEND_TOKEN: BACKEND_TOKEN,
            },
        });
        await runLifecycle(backend);
        server.kill('SIGKILL');
        await waitForExit(server);
        server = null;

        console.info('[external-smoke] Boot с попыткой env-переключения режима...');
        await runModeImmutabilityCheck(consumerDir, backend);

        console.info('[external-smoke] Boot с попыткой env-включения database-auth...');
        await runDatabaseAuthDefenseCheck(consumerDir);

        console.info('[external-smoke] Успех — external-контракт цел.');
    } catch (error) {
        console.error(`[external-smoke] ПРОВАЛ (папка сохранена для разбора: ${workDir})`);
        throw error;
    } finally {
        server?.kill('SIGKILL');
        backend.server.close();
    }
    await rm(workDir, { recursive: true, force: true });
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
