#!/usr/bin/env node
/**
 * Догенерация уменьшенных вариантов (preview ~480px, mock ~32px) для медиа,
 * загруженных до появления постепенной загрузки.
 *
 * Без него у старых файлов `preview_url` и `mock_url` остаются пустыми. Само по
 * себе это не поломка — `BricksImage` в таком случае честно грузит полный файл
 * сразу, — но постепенной загрузки у них не будет никогда, и разница между
 * старыми и новыми картинками на странице выглядит случайной.
 *
 * Использование:
 *   node scripts/backfill-media-variants.mjs [--dry-run] [--limit <N>]
 *
 * Подключение и доступ к хранилищу берутся из окружения (те же переменные, что у
 * приложения): NUXT_BRICKS_DATABASE_URL (или DATABASE_URL), NUXT_BRICKS_S3_BUCKET,
 * NUXT_BRICKS_S3_ENDPOINT, NUXT_BRICKS_S3_REGION, NUXT_BRICKS_S3_ACCESS_KEY_ID,
 * NUXT_BRICKS_S3_SECRET_ACCESS_KEY.
 *
 * Идемпотентен: берёт только строки с пустыми `preview_url`/`mock_url`, поэтому
 * повторный запуск после обрыва догоняет остаток. Отказ по одному файлу не
 * останавливает проход — битая ссылка или неподдерживаемый sharp'ом вход
 * логируется и пропускается.
 *
 * Судьба загруженных вариантов при отказе решается тем, ЧТО известно об исходе
 * записи, — тем же правилом, что и в рантайме. Ссылки заведомо не будет (строка
 * исчезла во время прохода, набор оборвался на середине) — объекты удаляются.
 * Исход UPDATE неизвестен — объекты остаются: строка могла закоммититься, и
 * битое превью в галерее хуже невидимого мусора в бакете.
 *
 * Варианты всегда webp, как и при загрузке: их задача — показаться в любом
 * браузере, а не повторить формат полного файла.
 */
import process from 'node:process';
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { processRow, RASTER_MIME_PATTERN } from './backfill-variants-core.mjs';

/** Потолок установки соединения с хранилищем (мс). */
const S3_CONNECTION_TIMEOUT_MS = 5_000;
/**
 * Потолок тишины сокета (мс) — именно `socketTimeout`, не `requestTimeout`:
 * второй ограничивает суммарное время запроса и без `throwOnRequestTimeout`
 * только пишет warning, то есть зависший endpoint не обрывает.
 */
const S3_SOCKET_TIMEOUT_MS = 30_000;
/**
 * Всего попыток одного запроса к хранилищу (одна плюс один повтор). Дефолтные три
 * на зависшем endpoint дают три окна тишины подряд плюс backoff, то есть проход
 * стоит на одном файле полторы минуты; одного повтора хватает, чтобы пережить
 * одиночный сетевой сбой.
 */
const S3_MAX_ATTEMPTS = 2;
/**
 * Ключ advisory lock прохода. Два одновременных backfill'а строят одни и те же
 * ключи вариантов, и компенсация одного удаляла бы объект, который другой только
 * что связал с записью.
 */
const BACKFILL_ADVISORY_LOCK_KEY = 4_179_002_733;

/**
 * Разбирает аргументы командной строки.
 *
 * @returns {{ dryRun: boolean, limit: number | null }} Режим и лимит.
 */
function parseArgs() {
    const args = process.argv.slice(2);
    const limitIndex = args.indexOf('--limit');
    const rawLimit = limitIndex !== -1 ? Number(args[limitIndex + 1]) : Number.NaN;

    return {
        dryRun: args.includes('--dry-run'),
        limit: Number.isInteger(rawLimit) && rawLimit > 0 ? rawLimit : null,
    };
}

/**
 * Читает конфигурацию из окружения и падает с внятным сообщением, если чего-то
 * не хватает: скрипт трогает и БД, и бакет, и половинчатый запуск оставил бы
 * записи с URL вариантов, которых в хранилище нет.
 *
 * @returns {{ databaseUrl: string, s3: object }} Конфигурация.
 */
function resolveConfig() {
    const databaseUrl = process.env.NUXT_BRICKS_DATABASE_URL || process.env.DATABASE_URL;
    const bucket = process.env.NUXT_BRICKS_S3_BUCKET;
    const accessKeyId = process.env.NUXT_BRICKS_S3_ACCESS_KEY_ID;
    const secretAccessKey = process.env.NUXT_BRICKS_S3_SECRET_ACCESS_KEY;
    const missing = [
        !databaseUrl && 'NUXT_BRICKS_DATABASE_URL',
        !bucket && 'NUXT_BRICKS_S3_BUCKET',
        !accessKeyId && 'NUXT_BRICKS_S3_ACCESS_KEY_ID',
        !secretAccessKey && 'NUXT_BRICKS_S3_SECRET_ACCESS_KEY',
    ].filter(Boolean);

    if (missing.length > 0) {
        console.error(`[backfill] Не заданы переменные окружения: ${missing.join(', ')}`);
        process.exit(1);
    }

    return {
        databaseUrl,
        s3: {
            bucket,
            accessKeyId,
            secretAccessKey,
            endpoint: process.env.NUXT_BRICKS_S3_ENDPOINT || 'https://storage.yandexcloud.net',
            region: process.env.NUXT_BRICKS_S3_REGION || 'ru-central1',
        },
    };
}

/**
 * Точка входа.
 */
async function main() {
    const { dryRun, limit } = parseArgs();
    const config = { ...resolveConfig(), dryRun };

    const [
        { default: pg },
        { default: sharp },
        { S3Client, PutObjectCommand, DeleteObjectCommand },
    ] = await Promise.all([import('pg'), import('sharp'), import('@aws-sdk/client-s3')]);

    const client = new pg.Client({ connectionString: config.databaseUrl });
    const s3Client = new S3Client({
        endpoint: config.s3.endpoint,
        region: config.s3.region,
        credentials: {
            accessKeyId: config.s3.accessKeyId,
            secretAccessKey: config.s3.secretAccessKey,
        },
        // Без потолков зависший endpoint вешает проход насовсем: у SDK по
        // умолчанию нет ни таймаута соединения, ни таймаута тишины сокета
        requestHandler: {
            connectionTimeout: S3_CONNECTION_TIMEOUT_MS,
            socketTimeout: S3_SOCKET_TIMEOUT_MS,
        },
        maxAttempts: S3_MAX_ATTEMPTS,
    });

    await client.connect();

    try {
        // Первым же оператором внутри try, чтобы `client.end()` из finally
        // выполнился и при занятом lock. Lock сессионный: закрытие соединения
        // снимает его само, в том числе после исключения
        const lock = await client.query('SELECT pg_try_advisory_lock($1) AS acquired', [
            BACKFILL_ADVISORY_LOCK_KEY,
        ]);

        if (!lock.rows[0]?.acquired) {
            throw new Error(
                'другой проход backfill уже идёт (advisory lock занят) — параллельные проходы строят одни и те же ключи вариантов'
            );
        }

        const { rows } = await client.query(
            `SELECT id, url, mime_type, preview_url, mock_url
             FROM bricks_media
             WHERE (preview_url IS NULL OR mock_url IS NULL)
               AND mime_type ~ $1
             ORDER BY id
             ${limit ? 'LIMIT ' + limit : ''}`,
            [RASTER_MIME_PATTERN.source]
        );

        console.log(`[backfill] К обработке: ${rows.length}${dryRun ? ' (dry-run)' : ''}`);

        let updated = 0;
        let failed = 0;

        const deps = { sharp, s3Client, PutObjectCommand, DeleteObjectCommand, config };

        for (const row of rows) {
            try {
                const outcome = await processRow(deps, client, row);

                if (outcome === 'updated') {
                    updated += 1;
                    continue;
                }

                // `skipped` — не отказ: делать было нечего (варианты уже на
                // месте либо URL записи лежит вне бакета)
                if (outcome !== 'skipped') {
                    failed += 1;
                }
            } catch (error) {
                failed += 1;
                console.warn(`[backfill] #${row.id}: пропуск — ${error.message}`);
            }
        }

        console.log(`[backfill] Готово: обновлено ${updated}, пропущено ${failed}`);
    } finally {
        await client.end();
        s3Client.destroy();
    }
}

/**
 * Запущен ли файл напрямую, а не импортирован (тестом).
 *
 * Пути сравниваются ПОСЛЕ разрешения симлинков: Node канонизирует путь
 * main-модуля, а `process.argv[1]` сохраняет путь вызова, поэтому лексическое
 * сравнение при запуске через симлинк тихо ничего не делало и выходило с кодом 0.
 * Любой отказ разрешения пути означает «не прямой запуск» — импорт не должен
 * падать из-за этой проверки.
 *
 * @param {string} metaUrl `import.meta.url` файла.
 * @param {string | undefined} argvPath `process.argv[1]`.
 * @returns {boolean} true — файл запущен как программа.
 */
function isDirectRun(metaUrl, argvPath) {
    if (!argvPath) {
        return false;
    }

    try {
        return realpathSync(fileURLToPath(metaUrl)) === realpathSync(argvPath);
    } catch {
        return false;
    }
}

if (isDirectRun(import.meta.url, process.argv[1])) {
    main().catch((error) => {
        console.error('[backfill] Прервано:', error);
        process.exit(1);
    });
}
