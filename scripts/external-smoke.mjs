#!/usr/bin/env node
/**
 * A Nitro-level smoke of the external data backend mode: a production-like check of the
 * WHOLE chain, which the unit and vitest smokes do not cover (those assemble the adapter
 * and the publish fake by hand): module setup → registry → the externalBackendStorage
 * Nitro plugin → the local `/api/bricks/**` handlers (the multipart upload included) →
 * HttpStorageAdapter → the fake external backend.
 *
 * The flow: npm pack → a clean consumer (backend.mode = 'external', an in-memory publish
 * adapter through setBricksPublishAdapter) → nuxi build → boot with
 * NUXT_BRICKS_BACKEND_URL/TOKEN → the lifecycle against the fake external backend (an
 * in-process node http server): readiness (the adapter path), page CRUD plus publish,
 * the public lookup, a multipart upload (sharp inside the consumer) → external receives
 * ONLY the JSON metadata with a Bearer, then a media delete. Separate boots check that
 * NUXT_BRICKS_BACKEND_MODE does NOT switch the mode (the mode is the build-time
 * registration of the plugin, not runtimeConfig) and that the runtime env
 * NUXT_BRICKS_AUTH_MODE=database in an external build answers 503 (the runtime defense
 * of the auth middleware). Between the boots the script waits for the previous process
 * to exit — otherwise the race for the port makes the check falsely positive.
 *
 * Usage: npm run smoke:external
 * The temporary directory is removed on success and kept on failure (its path is in the
 * log).
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
// The in-memory publish adapter of the consumer — the binary never leaves for the backend
const MEMORY_STORAGE_BASE = 'https://memory-storage.invalid/bucket/';
// A valid 1x1 PNG: sharp inside the consumer has to decode and convert it
const PNG_BASE64 =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

/**
 * Headers of an authorized request; unsafe methods pass the CSRF gate with the custom
 * x-bricks-csrf header.
 *
 * @returns {Record<string, string>} The headers.
 */
function authHeaders() {
    return {
        Authorization: `Basic ${Buffer.from(`${BASIC_USERNAME}:${BASIC_PASSWORD}`).toString('base64')}`,
        'x-bricks-csrf': '1',
    };
}

/**
 * Creates the consumer application of the external mode: backend.mode in nuxt.config and
 * an in-memory publish adapter registered by a Nitro plugin through
 * nuxt-bricks/persistence.
 *
 * @param {string} consumerDir - The consumer directory.
 * @param {string} tarballPath - Absolute path to the tarball.
 * @returns {Promise<void>} Resolves once the files are written.
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
            "        backend: { mode: 'external' }, // url and token arrive at boot through NUXT_BRICKS_BACKEND_*",
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
            '// An in-memory publish adapter: the files never leave the consumer process —',
            '// the smoke proves that only the metadata travels to the external backend',
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
 * The lifecycle against the started consumer server and the fake external backend.
 *
 * @param {ReturnType<typeof createFakeExternalBackend>} backend - The fake backend.
 * @returns {Promise<void>} Resolves when the lifecycle is green.
 */
async function runLifecycle(backend) {
    // Readiness: the external mode takes the adapter path (probeHealth → GET {base})
    const ready = await fetch(`${SERVER_ORIGIN}/api/bricks/health/ready`);
    assertOk(ready.status === 200, `external readiness expected 200, got ${ready.status}`);

    const anonymous = await fetch(`${SERVER_ORIGIN}/api/bricks`);
    assertOk(
        anonymous.status === 401,
        `anonymous GET /api/bricks expected 401: ${anonymous.status}`
    );

    // Creating a page through the LOCAL endpoint → HttpStorageAdapter → the fake backend
    const created = await fetch(`${SERVER_ORIGIN}/api/bricks`, {
        method: 'POST',
        headers: { ...authHeaders(), 'content-type': 'application/json' },
        body: JSON.stringify({
            pagename: PAGENAME,
            title: 'External smoke',
            schema: { components: [] },
        }),
    });
    assertOk(created.ok, `POST /api/bricks expected 2xx, got ${created.status}`);
    const createdPage = await created.json();
    assertOk(createdPage.pagename === PAGENAME, 'the create response carries no pagename');

    const backendCreate = backend.requests.find(
        (item) => item.method === 'POST' && item.path === BACKEND_BASE_PATH
    );
    assertOk(Boolean(backendCreate), 'the fake backend got no page-creating POST {base}');

    const list = await fetch(`${SERVER_ORIGIN}/api/bricks`, { headers: authHeaders() });
    const summaries = await list.json();
    assertOk(
        Array.isArray(summaries) && summaries.some((item) => item.pagename === PAGENAME),
        'GET /api/bricks did not return the created page'
    );
    assertOk(
        summaries.every((item) => !('schema' in item)),
        'the summaries of the listing must carry no schema'
    );

    // Publishing the page by a PATCH, then the public lookup as an anonymous visitor
    const published = await fetch(`${SERVER_ORIGIN}/api/bricks/${createdPage.id}`, {
        method: 'PATCH',
        headers: { ...authHeaders(), 'content-type': 'application/json' },
        body: JSON.stringify({ published: true }),
    });
    assertOk(published.ok, `PATCH published expected 2xx, got ${published.status}`);

    const publicPage = await fetch(`${SERVER_ORIGIN}/api/bricks/public/pages/${PAGENAME}`);
    assertOk(publicPage.status === 200, `public lookup expected 200: ${publicPage.status}`);
    const projection = await publicPage.json();
    assertOk(projection.pagename === PAGENAME, 'the public projection carries no pagename');
    assertOk(
        !('thumbnailUrl' in projection) && !('revision' in projection),
        'the public projection must carry no editor-only fields'
    );

    // The addressed public lookup: a page under a prefix is reachable by its full address
    // alone. The address travels as the rest of the path, and the backend has to look it
    // up by the `urlPrefix + pagename` pair
    const prefixedCreated = await fetch(`${SERVER_ORIGIN}/api/bricks`, {
        method: 'POST',
        headers: { ...authHeaders(), 'content-type': 'application/json' },
        body: JSON.stringify({
            pagename: PAGENAME,
            urlPrefix: 'external-smoke-prefix',
            title: 'External smoke prefixed',
            schema: { components: [] },
            published: true,
        }),
    });
    assertOk(
        prefixedCreated.ok,
        `POST of a page with a urlPrefix expected 2xx, got ${prefixedCreated.status}`
    );

    const prefixedPublic = await fetch(
        `${SERVER_ORIGIN}/api/bricks/public/pages/external-smoke-prefix/${PAGENAME}`
    );
    assertOk(
        prefixedPublic.status === 200,
        `public lookup of a prefixed address expected 200: ${prefixedPublic.status}`
    );
    const prefixedProjection = await prefixedPublic.json();
    assertOk(
        prefixedProjection.title === 'External smoke prefixed',
        'the addressed lookup returned the wrong page — it went by the name, not the pair'
    );

    // The other half: a bare name does not hand out a page living under a foreign prefix
    const foreignPrefix = await fetch(
        `${SERVER_ORIGIN}/api/bricks/public/pages/external-smoke-other/${PAGENAME}`
    );
    assertOk(foreignPrefix.status === 404, `foreign prefix expected 404: ${foreignPrefix.status}`);

    // The multipart upload: sharp processes the file inside the consumer, the binary goes
    // into the in-memory publish adapter, and only the JSON metadata leaves for external
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
    assertOk(uploaded.ok, `media upload expected 2xx, got ${uploaded.status}`);
    const media = await uploaded.json();
    assertOk(
        String(media.url).startsWith(MEMORY_STORAGE_BASE),
        `the media url must point into the memory of the consumer, got ${media.url}`
    );
    assertOk(media.mimeType === 'image/webp', `sharp must return webp: ${media.mimeType}`);

    const backendMedia = backend.requests.find(
        (item) => item.method === 'POST' && item.path === `${BACKEND_BASE_PATH}/media`
    );
    assertOk(Boolean(backendMedia), 'the fake backend got no POST {base}/media');
    assertOk(
        backendMedia.contentType === 'application/json',
        `the metadata must travel as JSON, got the content-type ${backendMedia.contentType}`
    );
    assertOk(
        typeof backendMedia.body?.url === 'string' &&
            backendMedia.body.url.startsWith(MEMORY_STORAGE_BASE),
        'the metadata on the backend carries no file url from the publish storage'
    );

    // Deleting media: the local orchestration is file-first, the backend gets metadata only
    const deleted = await fetch(`${SERVER_ORIGIN}/api/bricks/media/${media.id}`, {
        method: 'DELETE',
        headers: authHeaders(),
    });
    assertOk(deleted.ok, `media delete expected 2xx, got ${deleted.status}`);
    assertOk(
        backend.requests.some(
            (item) =>
                item.method === 'DELETE' && item.path === `${BACKEND_BASE_PATH}/media/${media.id}`
        ),
        'the fake backend got no DELETE {base}/media/:id'
    );

    // Invariants of the server-to-server transport — on EVERY request to the backend
    assertOk(backend.requests.length > 0, 'the fake backend got no request at all');
    for (const item of backend.requests) {
        assertOk(
            item.authorization === `Bearer ${BACKEND_TOKEN}`,
            `request ${item.method} ${item.path} without a Bearer token: "${item.authorization}"`
        );
        assertOk(
            !item.contentType.startsWith('multipart/'),
            `binary or multipart must not reach the external backend: ${item.method} ${item.path}`
        );
    }

    console.info('[external-smoke] The lifecycle is green');
}

/**
 * Checks that NUXT_BRICKS_BACKEND_MODE does not switch the mode after the build: the
 * consumer is built as external, so with an env "switch" to builtin the requests still
 * have to go to the fake backend (the mode is the build-time registration of the Nitro
 * plugin, and runtimeConfig carries no key for it).
 *
 * @param {string} consumerDir - The consumer directory.
 * @param {ReturnType<typeof createFakeExternalBackend>} backend - The fake backend.
 * @returns {Promise<void>} Resolves once the mode is confirmed unchanged.
 */
async function runModeImmutabilityCheck(consumerDir, backend) {
    const server = await bootServer(consumerDir, {
        port: SERVER_PORT,
        env: {
            NUXT_BASIC_AUTH_USERNAME: BASIC_USERNAME,
            NUXT_BASIC_AUTH_PASSWORD: BASIC_PASSWORD,
            NUXT_BRICKS_BACKEND_URL: BACKEND_URL,
            NUXT_BRICKS_BACKEND_TOKEN: BACKEND_TOKEN,
            // An attempt to switch the mode at runtime — it must be ignored
            NUXT_BRICKS_BACKEND_MODE: 'builtin',
        },
    });
    try {
        const before = backend.requests.length;
        const list = await fetch(`${SERVER_ORIGIN}/api/bricks`, { headers: authHeaders() });
        assertOk(
            list.status === 200,
            `GET /api/bricks under an env switch attempt expected 200 (external alive), got ${list.status}`
        );
        assertOk(
            backend.requests.length > before,
            'the request never reached the fake backend — the env did switch the mode'
        );
        console.info('[external-smoke] NUXT_BRICKS_BACKEND_MODE ignored: the mode is build-time');
    } finally {
        server.kill('SIGKILL');
        await waitForExit(server);
    }
}

/**
 * Checks the runtime defense of the auth middleware: an env attempt to turn on database
 * auth in an external build (going around the build-time ban on auth.mode=database plus
 * backend.mode=external) has to answer 503 pointing at the external mode instead of
 * working against the database slipped to it.
 *
 * @param {string} consumerDir - The consumer directory.
 * @returns {Promise<void>} Resolves once the refusal is confirmed.
 */
async function runDatabaseAuthDefenseCheck(consumerDir) {
    const server = await bootServer(consumerDir, {
        port: SERVER_PORT,
        env: {
            NUXT_BRICKS_BACKEND_URL: BACKEND_URL,
            NUXT_BRICKS_BACKEND_TOKEN: BACKEND_TOKEN,
            // An attempt to go around the build-time ban on database auth in an external
            // build
            NUXT_BRICKS_AUTH_MODE: 'database',
            NUXT_BRICKS_DATABASE_URL: 'postgres://smoke:smoke@127.0.0.1:5599/smoke',
        },
    });
    try {
        const response = await fetch(`${SERVER_ORIGIN}/api/bricks`);
        assertOk(
            response.status === 503,
            `database auth in an external build expected 503, got ${response.status}`
        );
        const body = await response.text();
        assertOk(
            body.includes('external backend mode'),
            'the refusal had to come from the external defense (a 503 over an unreachable database is a different guard)'
        );
        console.info('[external-smoke] NUXT_BRICKS_AUTH_MODE=database rejected by runtime defense');
    } finally {
        server.kill('SIGKILL');
        await waitForExit(server);
    }
}

/**
 * The main scenario of the smoke test.
 *
 * @returns {Promise<void>} Resolves on a full success.
 */
async function main() {
    const workDir = await mkdtemp(join(tmpdir(), 'bricks-external-smoke-'));
    console.info(`[external-smoke] Working directory: ${workDir}`);
    const backend = createFakeExternalBackend();
    await new Promise((resolve) => {
        backend.server.listen(BACKEND_PORT, '127.0.0.1', () => resolve(undefined));
    });
    let server = null;
    try {
        console.info('[external-smoke] npm pack (prepack builds the module)...');
        const packOutput = await runCapture(
            'npm',
            ['pack', '--pack-destination', workDir],
            REPO_ROOT
        );
        const tarballName = packOutput.trim().split('\n').at(-1)?.trim() ?? '';
        assertOk(tarballName.endsWith('.tgz'), `npm pack gave no tarball name: "${tarballName}"`);

        const consumerDir = join(workDir, 'consumer');
        await scaffoldConsumer(consumerDir, join(workDir, tarballName));

        console.info('[external-smoke] npm install in the clean consumer...');
        await run('npm', ['install', '--no-audit', '--no-fund'], { cwd: consumerDir });

        console.info('[external-smoke] nuxi build of the consumer application...');
        await run('npx', ['nuxi', 'build'], {
            cwd: consumerDir,
            env: { NUXT_TELEMETRY_DISABLED: '1' },
        });

        console.info('[external-smoke] Booting the production server (external mode)...');
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

        console.info('[external-smoke] Boot with an attempt to switch the mode by env...');
        await runModeImmutabilityCheck(consumerDir, backend);

        console.info('[external-smoke] Boot with an attempt to turn on database auth by env...');
        await runDatabaseAuthDefenseCheck(consumerDir);

        console.info('[external-smoke] Success — the external contract is intact.');
    } catch (error) {
        console.error(`[external-smoke] FAILED (the directory is kept for analysis: ${workDir})`);
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
