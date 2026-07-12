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
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, readdir, rm, writeFile, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SERVER_PORT = 3987;
const SERVER_ORIGIN = `http://127.0.0.1:${SERVER_PORT}`;
const BASIC_USERNAME = 'admin';
const BASIC_PASSWORD = 'pack-smoke-secret';
const BOOT_TIMEOUT_MS = 30_000;
const PAGE_MARKER = 'bricks-pack-smoke-ok';

/**
 * Запускает команду, стримит вывод и падает при ненулевом exit code.
 *
 * @param {string} command Исполняемый файл.
 * @param {string[]} args Аргументы.
 * @param {{ cwd?: string, env?: Record<string, string> }} options Рабочая папка и env.
 * @returns {Promise<void>} Резолвится при exit 0.
 */
function run(command, args, options = {}) {
    return new Promise((resolve, reject) => {
        const child = spawn(command, args, {
            cwd: options.cwd ?? REPO_ROOT,
            env: { ...process.env, ...options.env },
            stdio: 'inherit',
        });
        child.on('error', reject);
        child.on('exit', (code) => {
            if (code === 0) {
                resolve();
                return;
            }
            reject(new Error(`${command} ${args.join(' ')} завершился с кодом ${code}`));
        });
    });
}

/**
 * Запускает команду и возвращает stdout (для npm pack --json).
 *
 * @param {string} command Исполняемый файл.
 * @param {string[]} args Аргументы.
 * @param {string} cwd Рабочая папка.
 * @returns {Promise<string>} stdout процесса.
 */
function runCapture(command, args, cwd) {
    return new Promise((resolve, reject) => {
        const child = spawn(command, args, {
            cwd,
            env: process.env,
            stdio: ['ignore', 'pipe', 'inherit'],
        });
        let stdout = '';
        child.stdout.on('data', (chunk) => {
            stdout += chunk;
        });
        child.on('error', reject);
        child.on('exit', (code) => {
            if (code === 0) {
                resolve(stdout);
                return;
            }
            reject(new Error(`${command} ${args.join(' ')} завершился с кодом ${code}`));
        });
    });
}

/**
 * Утверждение с понятным сообщением об ошибке.
 *
 * @param {boolean} condition Условие.
 * @param {string} message Сообщение при провале.
 */
function assertOk(condition, message) {
    if (!condition) {
        throw new Error(`Smoke-проверка провалена: ${message}`);
    }
}

/**
 * Проверяет существование файла внутри установленного пакета.
 *
 * @param {string} path Абсолютный путь.
 * @param {string} label Человекочитаемое имя для ошибки.
 * @returns {Promise<void>} Резолвится, если файл есть.
 */
async function assertFileExists(path, label) {
    try {
        await access(path);
    } catch {
        throw new Error(`Smoke-проверка провалена: в пакете нет ${label} (${path})`);
    }
}

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
 * Поднимает прод-сервер из .output и ждёт готовности.
 *
 * @param {string} consumerDir Папка consumer.
 * @returns {Promise<import('node:child_process').ChildProcess>} Процесс сервера.
 */
async function bootServer(consumerDir) {
    const server = spawn('node', [join(consumerDir, '.output', 'server', 'index.mjs')], {
        cwd: consumerDir,
        env: {
            ...process.env,
            PORT: String(SERVER_PORT),
            HOST: '127.0.0.1',
            NODE_ENV: 'production',
            // Дефолтный basic-пароль в production отвечает 503 — задаём свой.
            // BASIC_AUTH_* — build-time fallback (запекается в runtimeConfig);
            // на уже собранный сервер креды доставляет nitro-override NUXT_*.
            NUXT_BASIC_AUTH_USERNAME: BASIC_USERNAME,
            NUXT_BASIC_AUTH_PASSWORD: BASIC_PASSWORD,
        },
        stdio: 'inherit',
    });
    const deadline = Date.now() + BOOT_TIMEOUT_MS;
    while (Date.now() < deadline) {
        if (server.exitCode !== null) {
            throw new Error(`Сервер завершился до готовности с кодом ${server.exitCode}`);
        }
        try {
            await fetch(`${SERVER_ORIGIN}/`, { signal: AbortSignal.timeout(2000) });
            return server;
        } catch {
            await new Promise((resolve) => {
                setTimeout(resolve, 500);
            });
        }
    }
    server.kill('SIGKILL');
    throw new Error(`Сервер не поднялся за ${BOOT_TIMEOUT_MS} мс`);
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
    assertOk(ready.status === 503, `readiness без persistence должен быть 503, получено ${ready.status}`);

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
        server = await bootServer(consumerDir);
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
