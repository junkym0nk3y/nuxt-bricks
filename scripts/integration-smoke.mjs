#!/usr/bin/env node
/**
 * Integration smoke: a production-like gate built out of the packed tarball.
 *
 * It needs a live Postgres (BRICKS_IT_DATABASE_URL); the S3 part turns on when
 * BRICKS_IT_S3_ENDPOINT/ACCESS_KEY/SECRET_KEY/BUCKET are set (MinIO in CI).
 *
 * The flow: npm pack → a clean consumer (database auth) → bricks-migrate out of the
 * tarball (plus a status with no pending and no drift; the same migration seeds the
 * default administrator the scenario runs as) → nuxi build → boot → the black-box HTTP
 * lifecycle (scripts/integration-lifecycle.mjs): the CSRF gate → login → CRUD of a page
 * → the schema contract (400) → optimistic locking (409 REVISION_CONFLICT) → publish →
 * the public read model → versions plus restore → media upload and delete (S3) →
 * logout.
 *
 * Usage: npm run smoke:integration
 * The temporary directory is removed on success and kept on failure (its path is in the
 * log).
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
 * The account of the scenario is the default administrator seeded by the migration: it
 * is the only way into a fresh database at all, its role is `admin`, and the scenario
 * goes as far as deleting a page (where an editor gets a 403).
 *
 * The password is deliberately NOT changed during the run: changing it tears down every
 * session of the account, and the next step of the scenario would get a 401 on a cookie
 * that looks alive.
 */
const IT_USERNAME = 'admin';
const IT_PASSWORD = 'bricks-pass';
const IT_PAGENAME = 'it-page';

/**
 * Writes a consumer project with database auth and, optionally, an S3 config.
 * The S3 endpoint and bucket are baked into runtimeConfig at build time (process.env is
 * read at the moment of nuxi build); the credentials arrive at boot through the
 * NUXT_BRICKS_S3_* runtime override.
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
                name: 'bricks-integration-consumer',
                private: true,
                type: 'module',
                dependencies: {
                    nuxt: '^3.21.1',
                    'nuxt-bricks': `file:${tarballPath}`,
                    // An optional peer of nuxt-bricks: the database mode needs pg on the
                    // consumer side
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
 * Creates the S3 bucket idempotently through the SDK from the node_modules of the
 * consumer (the same dependency the module itself uses). MinIO may still be coming up in
 * parallel — up to 10 retries with a pause between them.
 *
 * @param {string} consumerDir - The consumer directory.
 * @returns {Promise<void>} Resolves once the bucket exists.
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
 * The main scenario of the integration smoke.
 *
 * @returns {Promise<void>} Resolves on a full success.
 */
async function main() {
    assertOk(Boolean(DATABASE_URL), 'the BRICKS_IT_DATABASE_URL env var is required');

    const workDir = await mkdtemp(join(tmpdir(), 'bricks-int-smoke-'));
    console.info(`[integration-smoke] Working directory: ${workDir}`);
    let server = null;

    try {
        console.info('[integration-smoke] npm pack (prepack builds the module)...');
        const packOutput = await runCapture(
            'npm',
            ['pack', '--pack-destination', workDir],
            REPO_ROOT
        );
        const tarballName = packOutput.trim().split('\n').at(-1)?.trim() ?? '';
        assertOk(tarballName.endsWith('.tgz'), `npm pack gave no tarball name: "${tarballName}"`);
        const tarballPath = join(workDir, tarballName);

        const consumerDir = join(workDir, 'consumer');
        await scaffoldConsumer(consumerDir, tarballPath);

        console.info('[integration-smoke] npm install in the clean consumer...');
        await run('npm', ['install', '--no-audit', '--no-fund'], { cwd: consumerDir });

        const installedRoot = join(consumerDir, 'node_modules', 'nuxt-bricks');
        const migrateCli = join(installedRoot, 'dist', 'cli', 'bricks-migrate.mjs');

        console.info('[integration-smoke] bricks-migrate out of the tarball...');
        await run('node', [migrateCli, 'migrate', '--url', DATABASE_URL], { cwd: consumerDir });
        const status = await runCapture(
            'node',
            [migrateCli, 'status', '--url', DATABASE_URL],
            consumerDir
        );
        assertOk(/, 0 pending\./.test(status), `still pending after migrate:\n${status}`);
        assertOk(!status.includes('drifted'), `the checksum registry reported drift:\n${status}`);

        if (HAS_S3) {
            console.info('[integration-smoke] Creating the S3 bucket (MinIO)...');
            await ensureBucket(consumerDir);
        }

        console.info('[integration-smoke] nuxi build of the consumer application...');
        await run('npx', ['nuxi', 'build'], {
            cwd: consumerDir,
            env: { NUXT_TELEMETRY_DISABLED: '1' },
        });

        console.info('[integration-smoke] Boot of the production server and the HTTP lifecycle...');
        server = await bootServer(consumerDir, {
            port: SERVER_PORT,
            env: {
                NUXT_BRICKS_DATABASE_URL: DATABASE_URL,
                ...(HAS_S3
                    ? {
                          // The credentials are not baked into the build — a Nitro
                          // runtime override
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

        console.info('[integration-smoke] Success — the production-like lifecycle is intact.');
    } catch (error) {
        console.error(`[integration-smoke] FAILED (directory kept for analysis: ${workDir})`);
        throw error;
    } finally {
        server?.kill('SIGKILL');
    }
    // Reached on success only — on failure the throw above keeps the directory.
    await rm(workDir, { recursive: true, force: true });
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
