/**
 * Build-time скан brick-компонентов потребителя и запись манифеста (см.
 * src/module.ts): вызывается из хука `build:before` и из dev-вотчера на
 * `builder:watch`.
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { globby } from 'globby';
import { basename, isAbsolute, join, relative } from 'pathe';
import {
    BRICKS_MANIFEST_DIR,
    BRICKS_MANIFEST_FILENAME,
} from './runtime/modules/common/constants/brickManifest';
import type { IBricksManifest } from './runtime/modules/common/types/brickManifest';
import type {
    IBrickManifestSource,
    IBricksManifestOptions,
    IBricksManifestQueue,
} from './types/bricksManifest';

// #region Constants
const BRICK_FILE_SUFFIX = '.brick.ts';

/** Каталог скана, относительный к `srcDir`. */
const BRICK_COMPONENTS_DIR = 'components';

/**
 * Единственный паттерн поиска brick-файлов, относительный к `srcDir`.
 * srcDir у Nuxt 3 равен rootDir, у Nuxt 4 — `<rootDir>/app`, у playground —
 * `<repo>/playground`; во всех трёх случаях ключ загрузчика получается один и
 * тот же (`/components/…`), поэтому разбирать префиксы `app/`/`playground/`
 * и перебирать варианты пути больше не нужно.
 */
const BRICK_FILES_GLOB = `${BRICK_COMPONENTS_DIR}/**/*${BRICK_FILE_SUFFIX}`;

const CATEGORY_RE = /category\s*:\s*(['"])(.*?)\1/;
const DEFAULT_CATEGORY = 'Common';

/**
 * Суффикс временного файла атомарной публикации. Каталог манифеста смонтирован
 * как Nitro server asset, поэтому тем же суффиксом собирается `ignore`
 * монтирования (см. `src/module.ts`) — иначе временный файл стал бы ключом
 * namespace.
 */
export const BRICKS_MANIFEST_TEMP_SUFFIX = '.tmp';

/**
 * Счётчик временных файлов публикации: имя должно быть уникальным на процесс,
 * иначе два прогона (dev-вотчер и build:before нового инстанса Nuxt) писали бы
 * в один и тот же временный файл.
 */
let publishCounter = 0;
// #endregion

// #region Methods
/**
 * Попадает ли путь в область скана brick-файлов.
 *
 * Область та же, что у `BRICK_FILES_GLOB`: только `<srcDir>/components/**`.
 * `*.brick.ts` в других каталогах в манифест не попадает, поэтому и реагировать
 * на него dev-вотчеру незачем. Хук `builder:watch` отдаёт путь либо абсолютным,
 * либо относительным к `srcDir` (`experimental.relativeWatchPaths`) — в обоих
 * случаях уже POSIX-нормализованным.
 *
 * @param srcDir - `nuxt.options.srcDir`.
 * @param path - Путь из события вотчера.
 * @returns Признак brick-файла в области скана.
 */
export function isBrickFilePath(srcDir: string, path: string): boolean {
    const relativePath = isAbsolute(path) ? relative(srcDir, path) : path;

    return (
        relativePath.startsWith(`${BRICK_COMPONENTS_DIR}/`) &&
        relativePath.endsWith(BRICK_FILE_SUFFIX)
    );
}

/**
 * Достаёт категорию из содержимого brick-файла.
 *
 * @param content - Исходник `*.brick.ts`.
 * @returns Значение `category` или дефолтная категория.
 */
function extractCategory(content: string): string {
    return content.match(CATEGORY_RE)?.[2] || DEFAULT_CATEGORY;
}

/**
 * Считает хеш манифеста по содержимому brick-файлов.
 *
 * Хеш — сигнал «brick-файлы изменились». Потребителя у него пока нет: тот, ради
 * которого он приехал, снят вместе с HMR-надстройкой, а вернётся, когда
 * обновление библиотеки в dev сведётся к «сравнил хеш → перефетчил библиотеку».
 * Считается от исходников, а не от
 * инвентаря записей: `values`, `slots` и `description` лежат внутри файла и в
 * манифест не попадают, так что инвентарный хеш к их правке слеп — а именно она и
 * есть самая частая при разработке компонента.
 *
 * Путь и содержимое разделены NUL: без разделителя пара «путь + исходник» могла
 * бы склеиться с другой парой в ту же последовательность байт.
 *
 * @param sources - Прочитанные brick-файлы в порядке манифеста.
 * @returns Hex-представление SHA-256.
 */
function computeManifestHash(sources: IBrickManifestSource[]): string {
    const hash = createHash('sha256');

    for (const source of sources) {
        hash.update(source.entry.brickPath, 'utf8');
        hash.update('\0');
        hash.update(source.content, 'utf8');
        hash.update('\0');
    }

    return hash.digest('hex');
}

/**
 * Строит абсолютный путь каталога манифеста внутри buildDir.
 *
 * @param buildDir - `nuxt.options.buildDir`.
 * @returns Абсолютный путь каталога.
 */
export function resolveBricksManifestDir(buildDir: string): string {
    return join(buildDir, BRICKS_MANIFEST_DIR);
}

/**
 * Исчез ли файл между перечислением и чтением.
 *
 * @param error - Ошибка файловой операции.
 * @returns Признак ENOENT.
 */
function isMissingFileError(error: unknown): error is Error {
    return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

/**
 * Читает один brick-файл и превращает его в запись манифеста.
 *
 * Файл, исчезнувший между `globby` и `readFile`, пропускается: атомарное
 * сохранение редактора, `git checkout` или удаление каталога дают именно такую
 * гонку, и ронять из-за неё весь скан (а в dev — процесс) нельзя. Удаление всё
 * равно придёт отдельным событием вотчера и перегенерирует манифест.
 *
 * @param srcDir - `nuxt.options.srcDir` (база ключа загрузчика).
 * @param filePath - Абсолютный путь brick-файла.
 * @returns Запись манифеста с исходником или `null`, если файла уже нет.
 */
async function readManifestEntry(
    srcDir: string,
    filePath: string
): Promise<IBrickManifestSource | null> {
    try {
        const content = await readFile(filePath, 'utf8');

        return {
            entry: {
                name: basename(filePath, BRICK_FILE_SUFFIX),
                category: extractCategory(content),
                brickPath: `/${relative(srcDir, filePath)}`,
            },
            content,
        };
    } catch (error) {
        if (isMissingFileError(error)) {
            return null;
        }

        throw error;
    }
}

/**
 * Атомарно публикует манифест: запись во временный файл рядом с целевым и
 * `rename`. Ручка `/api/bricks/components` читает файл целиком, поэтому
 * недописанный JSON она увидеть не должна; временный файл лежит в том же
 * каталоге, иначе `rename` перестал бы быть атомарным.
 *
 * @param manifestDir - Каталог манифеста.
 * @param manifest - Публикуемый манифест.
 */
async function publishManifest(manifestDir: string, manifest: IBricksManifest): Promise<void> {
    const targetPath = join(manifestDir, BRICKS_MANIFEST_FILENAME);
    publishCounter += 1;
    const tempPath = `${targetPath}.${process.pid}.${publishCounter}${BRICKS_MANIFEST_TEMP_SUFFIX}`;

    await mkdir(manifestDir, { recursive: true });

    try {
        await writeFile(tempPath, JSON.stringify(manifest, null, 2), 'utf8');
        await rename(tempPath, targetPath);
    } catch (error) {
        // Оборванная публикация не должна оставлять мусор в buildDir
        await rm(tempPath, { force: true });

        throw error;
    }
}

/**
 * Сканирует `<srcDir>/components` на brick-файлы и пишет манифест.
 * Запись безусловная: пустой результат тоже сохраняется, иначе удаление
 * последнего brick оставило бы на диске устаревший список.
 *
 * @param options - srcDir и каталог манифеста.
 * @returns Записанный манифест.
 */
export async function generateBricksManifest(
    options: IBricksManifestOptions
): Promise<IBricksManifest> {
    const { srcDir, manifestDir } = options;

    const files = await globby(BRICK_FILES_GLOB, {
        cwd: srcDir,
        absolute: true,
        gitignore: false,
        onlyFiles: true,
    });

    const sources = await Promise.all(files.map((file) => readManifestEntry(srcDir, file)));
    // Порядок globby зависит от файловой системы — сортировка держит стабильными
    // и порядок записей, и хеш (он считается по этой же последовательности)
    const ordered = sources
        .filter((source): source is IBrickManifestSource => source !== null)
        .toSorted((left, right) => left.entry.brickPath.localeCompare(right.entry.brickPath));

    const manifest: IBricksManifest = {
        bricks: ordered.map((source) => source.entry),
        hash: computeManifestHash(ordered),
    };

    await publishManifest(manifestDir, manifest);

    return manifest;
}

/**
 * Создаёт сериализованную очередь генерации манифеста.
 *
 * Nuxt дёргает `builder:watch` отдельным `callHook` на каждое событие вотчера и
 * результата не ждёт, поэтому без очереди два быстрых сохранения (атомарная
 * запись редактора, format-on-save, `git checkout`) дают два конкурентных
 * скана — и манифест мог бы дописать более старый из них.
 *
 * Одновременно работает не больше одного скана; все заявки, пришедшие во время
 * работы, склеиваются в один догоняющий прогон — он всё равно читает ФС заново,
 * так что промежуточные проходы ничего не добавляют.
 *
 * @param options - srcDir и каталог манифеста.
 * @returns Очередь генерации.
 */
export function createBricksManifestQueue(options: IBricksManifestOptions): IBricksManifestQueue {
    let running: Promise<IBricksManifest | undefined> | null = null;
    let queued: Promise<IBricksManifest | undefined> | null = null;
    let isDisposed = false;

    /**
     * Промис, завершающийся вместе с исходным, но никогда не реджектящий:
     * упавший прогон не должен обрывать цепочку и оставлять реджект без
     * обработчика.
     *
     * @param promise - Исходный промис.
     * @returns Промис без реджекта.
     */
    function settle(promise: Promise<unknown>): Promise<void> {
        return promise.then(
            () => undefined,
            () => undefined
        );
    }

    /**
     * Запускает прогон и снимает признак «работает» после завершения.
     *
     * @returns Промис прогона.
     */
    function start(): Promise<IBricksManifest | undefined> {
        const run = isDisposed ? Promise.resolve(undefined) : generateBricksManifest(options);
        running = run;

        settle(run).then(() => {
            if (running === run) {
                running = null;
            }
        });

        return run;
    }

    /**
     * Ставит генерацию в очередь.
     *
     * @returns Манифест прогона или `undefined`, если очередь закрыта.
     */
    function enqueue(): Promise<IBricksManifest | undefined> {
        if (isDisposed) {
            return Promise.resolve(undefined);
        }

        // Догоняющий прогон ещё не начался — он увидит те же файлы
        if (queued) {
            return queued;
        }

        if (!running) {
            return start();
        }

        queued = settle(running).then(() => {
            queued = null;

            return start();
        });

        return queued;
    }

    /**
     * Закрывает очередь.
     *
     * @returns Промис завершения незавершённого скана.
     */
    async function dispose(): Promise<void> {
        isDisposed = true;

        // Скан старого инстанса Nuxt не должен переименовать свой временный
        // файл поверх манифеста нового: хук close вызывается до его build:before
        await settle(queued ?? running ?? Promise.resolve());
    }

    return { enqueue, dispose };
}
// #endregion
