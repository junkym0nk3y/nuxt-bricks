#!/usr/bin/env node
/**
 * Integration smoke: production-like гейт из собранного tarball.
 *
 * Требует живой Postgres (BRICKS_IT_DATABASE_URL); S3-часть включается при
 * заданных BRICKS_IT_S3_ENDPOINT/ACCESS_KEY/SECRET_KEY/BUCKET (MinIO в CI).
 *
 * Поток: npm pack → чистый consumer (database-auth) → bricks-migrate из
 * tarball (+ status без pending/drift; та же миграция заводит дефолтного
 * администратора, под которым идёт сценарий) → nuxi build → boot →
 * black-box HTTP lifecycle
 * (scripts/integration-lifecycle.mjs): CSRF-гейт → login → CRUD страницы →
 * контракт схемы (400) → optimistic locking (409 REVISION_CONFLICT) →
 * publish → public read-model → версии + restore → media upload/delete (S3)
 * → logout.
 *
 * Использование: npm run smoke:integration
 * Временная папка удаляется при успехе и сохраняется при ошибке (путь в логе).
 */
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { runLifecycle } from './integration-lifecycle.mjs';
import { assertOk, bootServer, run, runCapture } from './smoke-shared.mjs';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SERVER_PORT = 4311;
const SERVER_ORIGIN = `http://127.0.0.1:${SERVER_PORT}`;
const DATABASE_URL = process.env.BRICKS_IT_DATABASE_URL;
const S3 = {
    endpoint: process.env.BRICKS_IT_S3_ENDPOINT,
    accessKeyId: process.env.BRICKS_IT_S3_ACCESS_KEY,
    secretAccessKey: process.env.BRICKS_IT_S3_SECRET_KEY,
    bucket: process.env.BRICKS_IT_S3_BUCKET,
};
const HAS_S3 = Boolean(S3.endpoint && S3.accessKeyId && S3.secretAccessKey && S3.bucket);
/**
 * Учётка сценария — дефолтный администратор из сида миграции: он и есть
 * единственный способ войти в свежую базу, и роль у него `admin`, а сценарий
 * доходит до удаления страницы (editor'у там 403).
 *
 * Пароль намеренно НЕ меняется по ходу прогона: смена рвёт все сессии учётки,
 * и следующий шаг сценария получил бы 401 на живой, казалось бы, куке.
 */
const IT_USERNAME = 'admin';
const IT_PASSWORD = 'bricks-pass';
const IT_PAGENAME = 'it-page';

/**
 * Пишет consumer-проект с database-auth и (опционально) S3-конфигом.
 * Endpoint/bucket S3 запекаются в runtimeConfig на build (process.env
 * читается в момент nuxi build); креды доставляются на boot через
 * runtime-override NUXT_BRICKS_S3_*.
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
                name: 'bricks-integration-consumer',
                private: true,
                type: 'module',
                dependencies: {
                    nuxt: '^3.21.1',
                    'nuxt-bricks': `file:${tarballPath}`,
                    // Optional peer nuxt-bricks: database-режим требует pg у consumer'а
                    pg: '^8.16.0',
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
            "        auth: { mode: 'database' },",
            '        database: { url: process.env.BRICKS_IT_DATABASE_URL },',
            ...(HAS_S3
                ? [
                      '        s3: {',
                      '            endpoint: process.env.BRICKS_IT_S3_ENDPOINT,',
                      "            region: 'us-east-1',",
                      '            bucket: process.env.BRICKS_IT_S3_BUCKET,',
                      '        },',
                  ]
                : []),
            '    },',
            '});',
            '',
        ].join('\n')
    );
    await writeFile(
        join(consumerDir, 'pages', 'index.vue'),
        '<template>\n    <div>bricks-integration-consumer</div>\n</template>\n'
    );
}

/**
 * Создаёт S3-бакет идемпотентно через SDK из node_modules consumer'а
 * (та же зависимость, что использует модуль). MinIO может подниматься
 * параллельно — до 10 ретраев c паузой.
 *
 * @param {string} consumerDir Папка consumer.
 * @returns {Promise<void>} Резолвится, когда бакет существует.
 */
async function ensureBucket(consumerDir) {
    const sdkUrl = pathToFileURL(
        join(consumerDir, 'node_modules', '@aws-sdk', 'client-s3', 'dist-cjs', 'index.js')
    ).href;
    const { S3Client, CreateBucketCommand } = await import(sdkUrl);
    const client = new S3Client({
        endpoint: S3.endpoint,
        region: 'us-east-1',
        forcePathStyle: true,
        credentials: { accessKeyId: S3.accessKeyId, secretAccessKey: S3.secretAccessKey },
    });

    for (let attempt = 1; ; attempt += 1) {
        try {
            await client.send(new CreateBucketCommand({ Bucket: S3.bucket }));
            return;
        } catch (error) {
            const name = error?.name ?? '';
            if (name === 'BucketAlreadyOwnedByYou' || name === 'BucketAlreadyExists') {
                return;
            }
            if (attempt >= 10) {
                throw error;
            }
            await new Promise((resolve) => {
                setTimeout(resolve, 1000);
            });
        }
    }
}

/**
 * Основной сценарий integration smoke.
 *
 * @returns {Promise<void>} Резолвится при полном успехе.
 */
async function main() {
    assertOk(Boolean(DATABASE_URL), 'env BRICKS_IT_DATABASE_URL обязателен');

    const workDir = await mkdtemp(join(tmpdir(), 'bricks-int-smoke-'));
    console.info(`[integration-smoke] Рабочая папка: ${workDir}`);
    let server = null;

    try {
        console.info('[integration-smoke] npm pack (prepack соберёт модуль)...');
        const packOutput = await runCapture(
            'npm',
            ['pack', '--pack-destination', workDir],
            REPO_ROOT
        );
        const tarballName = packOutput.trim().split('\n').at(-1)?.trim() ?? '';
        assertOk(tarballName.endsWith('.tgz'), `npm pack не вернул имя tarball: «${tarballName}»`);
        const tarballPath = join(workDir, tarballName);

        const consumerDir = join(workDir, 'consumer');
        await scaffoldConsumer(consumerDir, tarballPath);

        console.info('[integration-smoke] npm install в чистом consumer...');
        await run('npm', ['install', '--no-audit', '--no-fund'], { cwd: consumerDir });

        const installedRoot = join(consumerDir, 'node_modules', 'nuxt-bricks');
        const migrateCli = join(installedRoot, 'dist', 'cli', 'bricks-migrate.mjs');

        console.info('[integration-smoke] bricks-migrate из tarball...');
        await run('node', [migrateCli, 'migrate', '--url', DATABASE_URL], { cwd: consumerDir });
        const status = await runCapture(
            'node',
            [migrateCli, 'status', '--url', DATABASE_URL],
            consumerDir
        );
        assertOk(/, 0 pending\./.test(status), `после migrate остались pending:\n${status}`);
        assertOk(!status.includes('drifted'), `checksum-реестр сообщил drift:\n${status}`);

        if (HAS_S3) {
            console.info('[integration-smoke] Создание S3-бакета (MinIO)...');
            await ensureBucket(consumerDir);
        }

        console.info('[integration-smoke] nuxi build consumer-приложения...');
        await run('npx', ['nuxi', 'build'], {
            cwd: consumerDir,
            env: { NUXT_TELEMETRY_DISABLED: '1' },
        });

        console.info('[integration-smoke] Boot прод-сервера и HTTP lifecycle...');
        server = await bootServer(consumerDir, {
            port: SERVER_PORT,
            env: {
                NUXT_BRICKS_DATABASE_URL: DATABASE_URL,
                ...(HAS_S3
                    ? {
                          // Креды не запекаются в build — runtime-override Nitro
                          NUXT_BRICKS_S3_ACCESS_KEY_ID: S3.accessKeyId,
                          NUXT_BRICKS_S3_SECRET_ACCESS_KEY: S3.secretAccessKey,
                          NUXT_BRICKS_S3_BUCKET: S3.bucket,
                      }
                    : {}),
            },
        });
        await runLifecycle({
            origin: SERVER_ORIGIN,
            username: IT_USERNAME,
            password: IT_PASSWORD,
            pagename: IT_PAGENAME,
            hasS3: HAS_S3,
        });

        console.info('[integration-smoke] Успех — production-like lifecycle цел.');
    } catch (error) {
        console.error(`[integration-smoke] ПРОВАЛ (папка сохранена для разбора: ${workDir})`);
        throw error;
    } finally {
        server?.kill('SIGKILL');
    }
    // Достигается только при успехе — при ошибке throw выше сохраняет папку.
    await rm(workDir, { recursive: true, force: true });
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
