#!/usr/bin/env node
/**
 * Fresh-consumer smoke test of the published tarball.
 *
 * It checks the contract of the npm package, which neither the unit tests nor the
 * playground cover (the playground consumes `../src/module`, not the built package):
 *   1. `npm pack` builds the tarball (prepack → nuxt-module-build).
 *   2. A clean consumer in a temporary directory installs the tarball (peers arrive
 *      automatically, npm >= 7) — package.json, exports and files are correct.
 *   3. The installed package carries dist, migrations/*.sql and the migration CLI bin.
 *   4. `nuxi build` of the consumer application passes without Postgres and PROXY_URL.
 *   5. The production server from .output comes up and holds the auth matrix: an own
 *      page answers 200, the editorial API and /bricks answer 401 to an anonymous
 *      visitor, and the basic credentials from env are accepted.
 *
 * Usage: npm run smoke:pack
 * The temporary directory is removed on success and kept on failure (its path is in the
 * log).
 */
import { existsSync } from 'node:fs';
import { mkdtemp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { assertFileExists, assertOk, bootServer, run, runCapture } from './smoke-shared.mjs';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SERVER_PORT = 3987;
const SERVER_ORIGIN = `http://127.0.0.1:${SERVER_PORT}`;
const BASIC_USERNAME = 'admin';
const BASIC_PASSWORD = 'pack-smoke-secret';
const PAGE_MARKER = 'bricks-pack-smoke-ok';

/**
 * Creates a minimal consumer application that consumes the tarball.
 *
 * @param {string} consumerDir - The consumer directory.
 * @param {string} tarballPath - Absolute path to the tarball.
 * @returns {Promise<void>} Resolves once the files are written.
 */
async function scaffoldConsumer(consumerDir, tarballPath) {
    await mkdir(join(consumerDir, 'pages'), { recursive: true });
    await writeFile(
        join(consumerDir, 'package.json'),
        JSON.stringify(
            {
                name: 'bricks-pack-smoke-consumer',
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
 * The HTTP matrix against the running server.
 *
 * @returns {Promise<void>} Resolves when the matrix is green.
 */
async function runHttpChecks() {
    const indexResponse = await fetch(`${SERVER_ORIGIN}/`);
    const indexBody = await indexResponse.text();
    assertOk(indexResponse.status === 200, `GET / expected 200, got ${indexResponse.status}`);
    assertOk(indexBody.includes(PAGE_MARKER), 'GET / carries no marker of the consumer page');

    for (const path of ['/api/bricks', '/api/bricks/media', '/bricks']) {
        const response = await fetch(`${SERVER_ORIGIN}${path}`);
        assertOk(
            response.status === 401,
            `anonymous GET ${path} expected 401, got ${response.status}`
        );
    }

    // With valid credentials the auth barrier is passed: any status but 401/403/503.
    // A 500 is fine — the smoke deliberately has no database (this is the packaging
    // contract, not persistence).
    const authorized = await fetch(`${SERVER_ORIGIN}/api/bricks`, {
        headers: {
            Authorization: `Basic ${Buffer.from(`${BASIC_USERNAME}:${BASIC_PASSWORD}`).toString('base64')}`,
        },
    });
    assertOk(
        ![401, 403, 503].includes(authorized.status),
        `GET /api/bricks with basic credentials must not answer 401/403/503, got ${authorized.status}`
    );

    const health = await fetch(`${SERVER_ORIGIN}/api/bricks/health`);
    assertOk(health.status === 200, `liveness must be 200, got ${health.status}`);

    // A consumer without a database and without PROXY_URL: readiness has to be 503
    const ready = await fetch(`${SERVER_ORIGIN}/api/bricks/health/ready`);
    assertOk(
        ready.status === 503,
        `readiness without persistence must be 503, got ${ready.status}`
    );

    console.info('[pack-smoke] The HTTP matrix is green');
}

/**
 * The main scenario of the smoke test.
 *
 * @returns {Promise<void>} Resolves on a full success.
 */
async function main() {
    const workDir = await mkdtemp(join(tmpdir(), 'bricks-pack-smoke-'));
    console.info(`[pack-smoke] Working directory: ${workDir}`);
    let server = null;
    try {
        console.info('[pack-smoke] npm pack (prepack builds the module)...');
        // Not --json: the stdout of npm pack is mixed with the output of the prepack
        // script. npm prints the tarball name as the last line of stdout.
        const packOutput = await runCapture(
            'npm',
            ['pack', '--pack-destination', workDir],
            REPO_ROOT
        );
        const tarballName = packOutput.trim().split('\n').at(-1)?.trim() ?? '';
        assertOk(tarballName.endsWith('.tgz'), `npm pack gave no tarball name: "${tarballName}"`);
        const tarballPath = join(workDir, tarballName);
        console.info(`[pack-smoke] Tarball: ${tarballName}`);

        const consumerDir = join(workDir, 'consumer');
        await scaffoldConsumer(consumerDir, tarballPath);

        console.info('[pack-smoke] npm install in the clean consumer...');
        await run('npm', ['install', '--no-audit', '--no-fund'], { cwd: consumerDir });

        const installedRoot = join(consumerDir, 'node_modules', 'nuxt-bricks');
        await assertFileExists(join(installedRoot, 'dist', 'module.mjs'), 'dist/module.mjs');
        // The migration registry is a scan of migrations/*.sql (bricks-migrate finds them
        // the same way): every migration of the repository has to reach the package.
        const repoMigrations = (await readdir(join(REPO_ROOT, 'migrations')))
            .filter((name) => name.endsWith('.sql'))
            .sort();
        assertOk(repoMigrations.length > 0, 'the repository has no migrations/*.sql at all');
        for (const migration of repoMigrations) {
            await assertFileExists(
                join(installedRoot, 'migrations', migration),
                `migrations/${migration}`
            );
        }
        await assertFileExists(
            join(installedRoot, 'dist', 'cli', 'bricks-migrate.mjs'),
            'CLI bricks-migrate'
        );
        // The external backend contract has to reach whoever installed the package: the
        // README points at it
        await assertFileExists(
            join(installedRoot, 'docs', 'external-backend-contract.md'),
            'docs/external-backend-contract.md'
        );

        // The dependency contract: h3-proxy is gone, while sharp and the AWS SDK are
        // required dependencies — the media flow needs them at runtime
        const installedPkg = JSON.parse(
            await readFile(join(installedRoot, 'package.json'), 'utf8')
        );
        assertOk(
            !installedPkg.dependencies?.['h3-proxy'],
            'h3-proxy must not be among the dependencies of the package'
        );
        assertOk(
            !existsSync(join(consumerDir, 'node_modules', 'h3-proxy')),
            'h3-proxy must not arrive in the node_modules of the consumer'
        );
        for (const dep of ['sharp', '@aws-sdk/client-s3']) {
            assertOk(
                Boolean(installedPkg.dependencies?.[dep]),
                `${dep} must be among the dependencies of the package`
            );
            assertOk(
                existsSync(join(consumerDir, 'node_modules', dep)),
                `${dep} did not reach the node_modules of the consumer`
            );
        }

        console.info('[pack-smoke] nuxi build of the consumer application...');
        await run('npx', ['nuxi', 'build'], {
            cwd: consumerDir,
            env: { NUXT_TELEMETRY_DISABLED: '1' },
        });

        console.info('[pack-smoke] Booting the production server and running the HTTP matrix...');
        server = await bootServer(consumerDir, {
            port: SERVER_PORT,
            env: {
                // The default basic password answers 503 in production, so we set our own.
                // BASIC_AUTH_* is the build-time fallback (baked into runtimeConfig); for an
                // already built server the credentials arrive through the NUXT_* nitro
                // override.
                NUXT_BASIC_AUTH_USERNAME: BASIC_USERNAME,
                NUXT_BASIC_AUTH_PASSWORD: BASIC_PASSWORD,
            },
        });
        await runHttpChecks();

        console.info('[pack-smoke] Success — the packaging contract is intact.');
    } catch (error) {
        console.error(`[pack-smoke] FAILED (the directory is kept for analysis: ${workDir})`);
        throw error;
    } finally {
        server?.kill('SIGKILL');
    }
    // Reached on success only — on failure the throw above keeps the directory for
    // analysis.
    await rm(workDir, { recursive: true, force: true });
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
