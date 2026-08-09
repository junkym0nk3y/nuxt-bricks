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
 * Варианты всегда webp, как и при загрузке: их задача — показаться в любом
 * браузере, а не повторить формат полного файла.
 */
import process from 'node:process';

// Значения обязаны совпадать с MEDIA_VARIANT_PRESETS и MEDIA_VARIANT_SUFFIXES
// (src/runtime/modules/persistence/server/utils/mediaVariants.ts). Импортировать
// оттуда нельзя — это TS-модуль рантайма, а скрипт запускается голым node
const VARIANTS = [
    { name: 'preview', suffix: '-preview', column: 'preview_url', maxWidth: 480, quality: 40 },
    { name: 'mock', suffix: '-mock', column: 'mock_url', maxWidth: 32, quality: 20 },
];
const VARIANT_EXTENSION = 'webp';
const VARIANT_MIME = 'image/webp';
/** Форматы, которые sharp обрабатывает: SVG и видео вариантов не получают. */
const RASTER_MIME_PATTERN = /^image\/(jpeg|png|webp|avif|gif|tiff|bmp|heic|heif)$/;
/** Потолок ожидания одного файла из хранилища (мс). */
const FETCH_TIMEOUT_MS = 30_000;
/**
 * Потолок размера читаемого файла. Тот же, что у ручки загрузки по умолчанию,
 * плюс запас: варианты догоняются для уже лежащих в бакете файлов, и среди них
 * могут быть импортированные мимо ручки. Без потолка одна аномально большая
 * запись валила бы весь проход по памяти.
 */
const MAX_SOURCE_BYTES = 64 * 1024 * 1024;

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
 * Строит URL и S3-ключ варианта из URL полного файла.
 *
 * Ключ выводится из URL, а не собирается заново из префикса конфига: у файлов,
 * импортированных из бакета, префикс мог быть другим, и «правильно собранный»
 * ключ указал бы не туда, где лежит сам файл.
 *
 * @param {string} fullUrl URL полного файла.
 * @param {string} suffix Суффикс варианта.
 * @param {object} s3 Конфигурация хранилища.
 * @returns {{ key: string, url: string } | null} Ключ и URL варианта.
 */
function buildVariantTarget(fullUrl, suffix, s3) {
    let parsed;
    let expected;

    try {
        parsed = new URL(fullUrl);
        expected = new URL(`${s3.endpoint.replace(/\/+$/, '')}/`);
    } catch {
        return null;
    }

    // Сверяется ОРIGIN, а не только путь: `https://attacker.example/<bucket>/x.png`
    // проходил проверку по pathname, и скрипт шёл за файлом на чужой хост.
    // userinfo отбрасывается отдельно — `https://host@attacker.example/...`
    // притворяется нашим хостом при разборе глазами, но не для fetch
    if (
        parsed.protocol !== expected.protocol ||
        parsed.host !== expected.host ||
        parsed.username ||
        parsed.password
    ) {
        return null;
    }

    const basePath = `/${s3.bucket}/`;

    if (!parsed.pathname.startsWith(basePath)) {
        return null;
    }

    let key;

    try {
        key = decodeURIComponent(parsed.pathname.slice(basePath.length));
    } catch {
        // Битое percent-кодирование: собранный из него ключ указал бы не туда
        return null;
    }

    // Обход вверх по «дереву» ключей и пустой ключ отбрасываются: имя объекта
    // строится из этой строки, и `../` увёл бы вариант за пределы префикса
    if (!key || key.includes('..') || key.startsWith('/')) {
        return null;
    }
    const lastSlashIndex = key.lastIndexOf('/');
    const directory = lastSlashIndex === -1 ? '' : key.slice(0, lastSlashIndex + 1);
    const filename = key.slice(lastSlashIndex + 1);
    const lastDotIndex = filename.lastIndexOf('.');
    const baseName = lastDotIndex > 0 ? filename.slice(0, lastDotIndex) : filename;
    const variantKey = `${directory}${baseName}${suffix}.${VARIANT_EXTENSION}`;

    return {
        key: variantKey,
        url: `${s3.endpoint.replace(/\/+$/, '')}/${s3.bucket}/${variantKey}`,
    };
}

/**
 * Забирает файл из хранилища по публичному URL.
 *
 * Тело читается по частям с потолком, а не `arrayBuffer()`: в `bricks_media`
 * лежат и URL вне бакета (модуль это допускает — см. ветку внешнего URL в
 * mediaOrchestration), и запись с неожиданно большим объектом. Без потолка такой
 * ответ читался бы в память целиком.
 *
 * @param {string} url Публичный URL.
 * @returns {Promise<Buffer>} Байты файла.
 */
async function downloadFile(url) {
    const response = await fetch(url, {
        redirect: 'error',
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
    }

    if (!response.body) {
        throw new Error('пустой ответ хранилища');
    }

    const chunks = [];
    let total = 0;

    for await (const chunk of response.body) {
        total += chunk.length;

        if (total > MAX_SOURCE_BYTES) {
            throw new Error(`файл больше ${MAX_SOURCE_BYTES} байт`);
        }

        chunks.push(chunk);
    }

    return Buffer.concat(chunks);
}

/**
 * Обрабатывает одну медиа-запись: генерирует варианты, кладёт их в хранилище и
 * возвращает патч колонок.
 *
 * @param {object} deps Зависимости: sharp, s3Client, PutObjectCommand, конфиг.
 * @param {object} row Строка bricks_media.
 * @returns {Promise<Record<string, string>>} Патч колонок (пустой — делать нечего).
 */
async function buildVariantsForRow(deps, row) {
    const pending = VARIANTS.filter((variant) => !row[variant.column]);

    if (pending.length === 0) {
        return {};
    }

    // Цели считаются ДО скачивания: URL записи может лежать вне нашего бакета
    // (модуль это допускает), и такую строку нужно пропустить, не сходив за
    // файлом на чужой хост
    const targets = pending
        .map((variant) => ({
            variant,
            target: buildVariantTarget(row.url, variant.suffix, deps.config.s3),
        }))
        .filter((entry) => entry.target !== null);

    if (targets.length === 0) {
        console.warn(`[backfill] #${row.id}: URL вне бакета, пропуск — ${row.url}`);
        return {};
    }

    const source = await downloadFile(row.url);
    const patch = {};

    for (const { variant, target } of targets) {
        const buffer = await deps
            .sharp(source, { limitInputPixels: 100_000_000 })
            .resize({ width: variant.maxWidth, fit: 'inside', withoutEnlargement: true })
            .webp({ quality: variant.quality })
            .toBuffer();

        if (!deps.config.dryRun) {
            await deps.s3Client.send(
                new deps.PutObjectCommand({
                    Bucket: deps.config.s3.bucket,
                    Key: target.key,
                    Body: buffer,
                    ContentType: VARIANT_MIME,
                    // Тот же ACL, что ставит штатный адаптер публикации. Без него
                    // в закрытом бакете, где публичность даётся объектным ACL,
                    // скрипт записал бы в БД адреса, отдающие 403: потребитель
                    // молча падал бы с варианта на полный файл, а проход
                    // рапортовал полный успех
                    ACL: 'public-read',
                })
            );
        }

        patch[variant.column] = target.url;
        console.log(
            `[backfill] #${row.id}: ${variant.name} → ${target.key} (${buffer.length} байт)` +
                (deps.config.dryRun ? ' [dry-run]' : '')
        );
    }

    return patch;
}

/**
 * Точка входа.
 */
async function main() {
    const { dryRun, limit } = parseArgs();
    const config = { ...resolveConfig(), dryRun };

    const [{ default: pg }, { default: sharp }, { S3Client, PutObjectCommand }] = await Promise.all(
        [import('pg'), import('sharp'), import('@aws-sdk/client-s3')]
    );

    const client = new pg.Client({ connectionString: config.databaseUrl });
    const s3Client = new S3Client({
        endpoint: config.s3.endpoint,
        region: config.s3.region,
        credentials: {
            accessKeyId: config.s3.accessKeyId,
            secretAccessKey: config.s3.secretAccessKey,
        },
    });

    await client.connect();

    try {
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

        for (const row of rows) {
            try {
                const patch = await buildVariantsForRow(
                    { sharp, s3Client, PutObjectCommand, config },
                    row
                );
                const columns = Object.keys(patch);

                if (columns.length === 0) {
                    continue;
                }

                if (!dryRun) {
                    const assignments = columns.map((column, index) => `${column} = $${index + 2}`);
                    await client.query(
                        `UPDATE bricks_media SET ${assignments.join(', ')} WHERE id = $1`,
                        [row.id, ...columns.map((column) => patch[column])]
                    );
                }

                updated += 1;
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

main().catch((error) => {
    console.error('[backfill] Прервано:', error);
    process.exit(1);
});
