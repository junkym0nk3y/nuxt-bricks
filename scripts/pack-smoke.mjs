#!/usr/bin/env node
/**
 * Fresh-consumer smoke test опубликованного tarball (P1 «CI и package contract»).
 *
 * Проверяет контракт npm-пакета, который не покрывают unit-тесты и playground
 * (playground потребляет `../src/module`, а не собранный пакет):
 *   1. `npm pack` собирает tarball (prepack → nuxt-module-build).
 *   2. Чистый consumer во временной папке ставит tarball (peers доезжают
 *      автоматически, npm >= 7) — package.json/exports/files корректны.
 *   3. В установленном пакете есть dist, migrations/*.sql и CLI-бины;
 *      bricks-hash-password работает без БД.
 *   4. `nuxi build` consumer-приложения проходит без Postgres и PROXY_URL.
 *   5. Прод-сервер из .output поднимается и держит auth-матрицу:
 *      своя страница отвечает 200, editorial API и /bricks — 401 анониму,
 *      basic-креды из env принимаются.
 *
 * Использование: npm run smoke:pack
 * Временная папка удаляется при успехе и сохраняется при ошибке (путь в логе).
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
 * Создаёт минимальное consumer-приложение, потребляющее tarball.
 *
 * @param {string} consumerDir Папка consumer.
 * @param {string} tarballPath Абсолютный путь к tarball.
 * @returns {Promise<void>} Резолвится после записи файлов.
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
 * HTTP-матрица против поднятого сервера.
 *
 * @returns {Promise<void>} Резолвится при зелёной матрице.
 */
async function runHttpChecks() {
    const indexResponse = await fetch(`${SERVER_ORIGIN}/`);
    const indexBody = await indexResponse.text();
    assertOk(indexResponse.status === 200, `GET / ожидался 200, получен ${indexResponse.status}`);
    assertOk(indexBody.includes(PAGE_MARKER), 'GET / не содержит маркер consumer-страницы');

    for (const path of ['/api/bricks', '/api/bricks/media', '/bricks']) {
        const response = await fetch(`${SERVER_ORIGIN}${path}`);
        assertOk(
            response.status === 401,
            `аноним GET ${path} ожидался 401, получен ${response.status}`
        );
    }

    // С валидными кредами auth-барьер пройден: любой статус, кроме 401/403/503.
    // 500 допустим — БД в smoke сознательно нет (packaging-контракт, не персистентность).
    const authorized = await fetch(`${SERVER_ORIGIN}/api/bricks`, {
        headers: {
            Authorization: `Basic ${Buffer.from(`${BASIC_USERNAME}:${BASIC_PASSWORD}`).toString('base64')}`,
        },
    });
    assertOk(
        ![401, 403, 503].includes(authorized.status),
        `GET /api/bricks с basic-кредами не должен отвечать 401/403/503, получен ${authorized.status}`
    );

    const health = await fetch(`${SERVER_ORIGIN}/api/bricks/health`);
    assertOk(health.status === 200, `liveness должен быть 200, получено ${health.status}`);

    // Consumer без БД и без PROXY_URL: readiness обязан быть 503 (аудит A-05)
    const ready = await fetch(`${SERVER_ORIGIN}/api/bricks/health/ready`);
    assertOk(
        ready.status === 503,
        `readiness без persistence должен быть 503, получено ${ready.status}`
    );

    console.info('[pack-smoke] HTTP-матрица зелёная');
}

/**
 * Основной сценарий smoke-теста.
 *
 * @returns {Promise<void>} Резолвится при полном успехе.
 */
async function main() {
    const workDir = await mkdtemp(join(tmpdir(), 'bricks-pack-smoke-'));
    console.info(`[pack-smoke] Рабочая папка: ${workDir}`);
    let server = null;
    try {
        console.info('[pack-smoke] npm pack (prepack соберёт модуль)...');
        // Не --json: stdout npm pack перемешан с выводом prepack-скрипта.
        // Имя tarball npm печатает последней строкой stdout.
        const packOutput = await runCapture(
            'npm',
            ['pack', '--pack-destination', workDir],
            REPO_ROOT
        );
        const tarballName = packOutput.trim().split('\n').at(-1)?.trim() ?? '';
        assertOk(tarballName.endsWith('.tgz'), `npm pack не вернул имя tarball: «${tarballName}»`);
        const tarballPath = join(workDir, tarballName);
        console.info(`[pack-smoke] Tarball: ${tarballName}`);

        const consumerDir = join(workDir, 'consumer');
        await scaffoldConsumer(consumerDir, tarballPath);

        console.info('[pack-smoke] npm install в чистом consumer...');
        await run('npm', ['install', '--no-audit', '--no-fund'], { cwd: consumerDir });

        const installedRoot = join(consumerDir, 'node_modules', 'nuxt-bricks');
        await assertFileExists(join(installedRoot, 'dist', 'module.mjs'), 'dist/module.mjs');
        // Реестр миграций = скан migrations/*.sql (так же их находит bricks-migrate):
        // каждая миграция из репозитория обязана доехать в пакет.
        const repoMigrations = (await readdir(join(REPO_ROOT, 'migrations')))
            .filter((name) => name.endsWith('.sql'))
            .sort();
        assertOk(repoMigrations.length > 0, 'в репозитории нет ни одной migrations/*.sql');
        for (const migration of repoMigrations) {
            await assertFileExists(
                join(installedRoot, 'migrations', migration),
                `migrations/${migration}`
            );
        }
        for (const bin of ['bricks-generate', 'bricks-hash-password', 'bricks-migrate']) {
            await assertFileExists(join(installedRoot, 'dist', 'cli', `${bin}.mjs`), `CLI ${bin}`);
        }

        // Контракт зависимостей (план backend-connection-modes): h3-proxy удалён,
        // sharp и AWS SDK — обязательные dependencies (runtime-контракт media flow)
        const installedPkg = JSON.parse(
            await readFile(join(installedRoot, 'package.json'), 'utf8')
        );
        assertOk(
            !installedPkg.dependencies?.['h3-proxy'],
            'h3-proxy не должен быть в dependencies пакета'
        );
        assertOk(
            !existsSync(join(consumerDir, 'node_modules', 'h3-proxy')),
            'h3-proxy не должен приезжать в node_modules consumer'
        );
        for (const dep of ['sharp', '@aws-sdk/client-s3']) {
            assertOk(
                Boolean(installedPkg.dependencies?.[dep]),
                `${dep} должен быть в dependencies пакета`
            );
            assertOk(
                existsSync(join(consumerDir, 'node_modules', dep)),
                `${dep} не доехал в node_modules consumer`
            );
        }

        console.info('[pack-smoke] CLI bricks-hash-password из пакета...');
        const hashOutput = await runCapture(
            'node',
            [
                join(installedRoot, 'dist', 'cli', 'bricks-hash-password.mjs'),
                'smoke-password',
                '--username',
                'smoke',
            ],
            consumerDir
        );
        assertOk(hashOutput.includes('scrypt:'), 'bricks-hash-password не вернул scrypt-хеш');

        console.info('[pack-smoke] nuxi build consumer-приложения...');
        await run('npx', ['nuxi', 'build'], {
            cwd: consumerDir,
            env: { NUXT_TELEMETRY_DISABLED: '1' },
        });

        console.info('[pack-smoke] Boot прод-сервера и HTTP-матрица...');
        server = await bootServer(consumerDir, {
            port: SERVER_PORT,
            env: {
                // Дефолтный basic-пароль в production отвечает 503 — задаём свой.
                // BASIC_AUTH_* — build-time fallback (запекается в runtimeConfig);
                // на уже собранный сервер креды доставляет nitro-override NUXT_*.
                NUXT_BASIC_AUTH_USERNAME: BASIC_USERNAME,
                NUXT_BASIC_AUTH_PASSWORD: BASIC_PASSWORD,
            },
        });
        await runHttpChecks();

        console.info('[pack-smoke] Успех — packaging-контракт цел.');
    } catch (error) {
        console.error(`[pack-smoke] ПРОВАЛ (папка сохранена для разбора: ${workDir})`);
        throw error;
    } finally {
        server?.kill('SIGKILL');
    }
    // Достигается только при успехе — при ошибке throw выше сохраняет папку для разбора.
    await rm(workDir, { recursive: true, force: true });
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
