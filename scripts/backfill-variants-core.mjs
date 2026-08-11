/**
 * Ядро backfill'а уменьшенных вариантов: адреса объектов, чтение исходника и
 * правило компенсации при отказе.
 *
 * Отдельно от CLI (`backfill-media-variants.mjs`) по двум причинам: файл со
 * разбором аргументов, подключением к БД и проходом по выборке перерастал потолок
 * длины, а правило компенсации здесь несимметричное и обязано проверяться
 * юнитами — импорт CLI-файла потянул бы за собой живые `pg` и S3.
 */
import { Buffer } from 'node:buffer';

// Значения обязаны совпадать с MEDIA_VARIANT_PRESETS и MEDIA_VARIANT_SUFFIXES
// (src/runtime/modules/persistence/server/utils/mediaVariants.ts). Импортировать
// оттуда нельзя — это TS-модуль рантайма, а скрипт запускается голым node
export const VARIANTS = [
    { name: 'preview', suffix: '-preview', column: 'preview_url', maxWidth: 480, quality: 40 },
    { name: 'mock', suffix: '-mock', column: 'mock_url', maxWidth: 32, quality: 20 },
];
const VARIANT_EXTENSION = 'webp';
const VARIANT_MIME = 'image/webp';
/** Форматы, которые sharp обрабатывает: SVG и видео вариантов не получают. */
export const RASTER_MIME_PATTERN = /^image\/(jpeg|png|webp|avif|gif|tiff|bmp|heic|heif)$/;
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
 * Потолок компенсирующего удаления (мс). Своя граница нужна потому, что уборка
 * идёт тем же клиентом с теми же ретраями: без неё отказ PUT возвращался бы
 * наружу ещё через два окна тишины.
 */
const S3_CLEANUP_TIMEOUT_MS = 10_000;
/**
 * Строит URL и S3-ключ варианта из URL полного файла.
 *
 * Ключ выводится из URL, а не собирается заново из префикса конфига: у файлов,
 * импортированных из бакета, префикс мог быть другим, и «правильно собранный»
 * ключ указал бы не туда, где лежит сам файл.
 *
 * В ключ входит id записи, потому что имени файла для уникальности не хватает:
 * импорт из бакета создаёт записи по произвольным ключам, уникален в схеме
 * только полный url, — и `photo.png` с `photo.jpg` давали один
 * `photo-preview.webp`. Один вариант перезаписывал бы другой, а компенсация
 * отказа удаляла бы объект, на который уже ссылается чужая запись. Id стоит
 * ПЕРЕД суффиксом: суффикс обязан остаться последним токеном имени, иначе
 * `isMediaVariantFilename` перестанет узнавать вариант и импорт покажет его
 * отдельным файлом медиатеки.
 *
 * @param {string} fullUrl URL полного файла.
 * @param {string} suffix Суффикс варианта.
 * @param {object} s3 Конфигурация хранилища.
 * @param {number} rowId Идентификатор записи bricks_media.
 * @returns {{ key: string, url: string } | null} Ключ и URL варианта.
 */
export function buildVariantTarget(fullUrl, suffix, s3, rowId) {
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
    const variantKey = `${directory}${baseName}-${rowId}${suffix}.${VARIANT_EXTENSION}`;

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
export async function downloadFile(url) {
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
 * Удаляет объекты, которые не получат ссылки из БД.
 *
 * Best-effort: отказ удаления не останавливает проход, но ключ уходит в лог —
 * иначе объект остался бы невидимым мусором, о котором никто не знает.
 *
 * @param {object} deps Зависимости: s3Client, DeleteObjectCommand, конфиг.
 * @param {string[]} keys Ключи, которые МОГЛИ быть записаны (в том числе PUT'ом
 * с неизвестным исходом).
 * @returns {Promise<void>} Резолвится после попытки удалить все ключи.
 */
export async function deleteUploadedObjects(deps, keys) {
    await Promise.all(
        keys.map(async (key) => {
            try {
                await deps.s3Client.send(
                    new deps.DeleteObjectCommand({ Bucket: deps.config.s3.bucket, Key: key }),
                    { abortSignal: AbortSignal.timeout(S3_CLEANUP_TIMEOUT_MS) }
                );
            } catch (error) {
                console.warn(`[backfill] Не удалён осиротевший объект ${key}: ${error.message}`);
            }
        })
    );
}

/**
 * Обрабатывает одну медиа-запись: генерирует варианты, кладёт их в хранилище и
 * возвращает патч колонок вместе с ключами загруженных объектов.
 *
 * @param {object} deps Зависимости: sharp, s3Client, PutObjectCommand, DeleteObjectCommand, конфиг.
 * @param {object} row Строка bricks_media.
 * @returns {Promise<{ patch: Record<string, string>, keys: string[] }>} Патч колонок
 * (пустой — делать нечего) и ключи объектов, которым нужна ссылка из БД.
 */
export async function buildVariantsForRow(deps, row) {
    const pending = VARIANTS.filter((variant) => !row[variant.column]);

    if (pending.length === 0) {
        return { patch: {}, keys: [] };
    }

    // Цели считаются ДО скачивания: URL записи может лежать вне нашего бакета
    // (модуль это допускает), и такую строку нужно пропустить, не сходив за
    // файлом на чужой хост
    const targets = pending
        .map((variant) => ({
            variant,
            target: buildVariantTarget(row.url, variant.suffix, deps.config.s3, row.id),
        }))
        .filter((entry) => entry.target !== null);

    if (targets.length === 0) {
        console.warn(`[backfill] #${row.id}: URL вне бакета, пропуск — ${row.url}`);
        return { patch: {}, keys: [] };
    }

    const source = await downloadFile(row.url);
    const patch = {};
    const writtenKeys = [];

    for (const { variant, target } of targets) {
        try {
            const buffer = await deps
                .sharp(source, { limitInputPixels: 100_000_000 })
                .resize({ width: variant.maxWidth, fit: 'inside', withoutEnlargement: true })
                .webp({ quality: variant.quality })
                .toBuffer();

            if (!deps.config.dryRun) {
                // Ключ записывается ДО отправки: отказ `send` не означает, что
                // объекта в бакете нет, — ответ мог потеряться или упереться в
                // таймаут уже после записи. Ключ, добавленный только после
                // успеха, оставлял бы такой объект без ссылки навсегда, а
                // `DeleteObject` идемпотентен, то есть лишнее удаление
                // ненаписанного объекта ничего не стоит
                writtenKeys.push(target.key);
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
        } catch (error) {
            // Отказ на середине набора: строка пропускается целиком, то есть
            // ссылки не получит ни один из уже отправленных вариантов. Откат
            // нужен здесь, а не «потом само перезапишется»: ключ детерминирован
            // и повторный прогон действительно перезаписал бы объект, но если
            // строку до того удалят или второй вариант не собирается в принципе,
            // объект остаётся мусором навсегда
            await deleteUploadedObjects(deps, writtenKeys);

            throw error;
        }
    }

    return { patch, keys: writtenKeys };
}

/**
 * Обрабатывает одну строку целиком: собирает варианты, кладёт их в хранилище и
 * связывает с записью — либо компенсирует, если ссылки заведомо не будет.
 *
 * Экспортируется ради тестов: правило компенсации здесь несимметричное (см.
 * шапку файла), и все четыре его ветки должны быть проверяемы без живой БД.
 *
 * @param {object} deps Зависимости: sharp, s3Client, PutObjectCommand, DeleteObjectCommand, конфиг.
 * @param {{ query: (text: string, values: unknown[]) => Promise<{ rowCount: number }> }} client
 * Клиент БД.
 * @param {object} row Строка bricks_media.
 * @returns {Promise<'updated' | 'skipped' | 'missing' | 'unknown'>} Исход:
 * `skipped` — делать нечего, `missing` — запись исчезла (варианты удалены),
 * `unknown` — исход UPDATE неизвестен (варианты сохранены).
 */
export async function processRow(deps, client, row) {
    const { patch, keys } = await buildVariantsForRow(deps, row);
    const columns = Object.keys(patch);

    if (columns.length === 0) {
        return 'skipped';
    }

    if (deps.config.dryRun) {
        return 'updated';
    }

    const assignments = columns.map((column, index) => `${column} = $${index + 2}`);
    let result;

    try {
        result = await client.query(
            `UPDATE bricks_media SET ${assignments.join(', ')} WHERE id = $1`,
            [row.id, ...columns.map((column) => patch[column])]
        );
    } catch (error) {
        // Исход UPDATE неизвестен (обрыв, отмена statement'а): удаление снесло бы
        // варианты из-под записи, которая могла закоммититься, и галерея
        // показывала бы битые превью. Объект без ссылки дешевле — адреса в лог
        console.warn(
            `[backfill] #${row.id}: исход UPDATE неизвестен, варианты сохранены` +
                ` (${keys.join(', ')}) — ${error.message}`
        );

        return 'unknown';
    }

    // Строку удалили во время прохода: ссылки на варианты не появится никогда, и
    // без удаления они остались бы постоянными сиротами — полный файл удалён
    // вместе с записью
    if (result.rowCount === 0) {
        await deleteUploadedObjects(deps, keys);
        console.warn(`[backfill] #${row.id}: запись исчезла во время прохода, варианты удалены`);

        return 'missing';
    }

    return 'updated';
}
