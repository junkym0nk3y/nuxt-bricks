/**
 * Build-time скан brick-компонентов потребителя и запись манифеста (см.
 * src/module.ts): вызывается из хука `build:before` и из dev-вотчера на
 * `builder:watch`.
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { globby } from 'globby';
import { basename, isAbsolute, join, relative } from 'pathe';
import {
    BRICKS_MANIFEST_DIR,
    BRICKS_MANIFEST_FILENAME,
} from './runtime/modules/common/constants/brickManifest';
import type {
    IBrickManifestEntry,
    IBricksManifest,
} from './runtime/modules/common/types/brickManifest';

// #region Types
/** Параметры генерации манифеста. */
export interface IBricksManifestOptions {
    /** `nuxt.options.srcDir` — база и для поиска файлов, и для ключей загрузчика. */
    srcDir: string;
    /** Каталог манифеста (см. resolveBricksManifestDir). */
    manifestDir: string;
}
// #endregion

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
 * Считает SHA-256 хеш строки.
 *
 * @param data - Данные для хеширования.
 * @returns Hex-представление хеша.
 */
function computeHash(data: string): string {
    return createHash('sha256').update(data, 'utf8').digest('hex');
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
 * Читает один brick-файл и превращает его в запись манифеста.
 *
 * @param srcDir - `nuxt.options.srcDir` (база ключа загрузчика).
 * @param filePath - Абсолютный путь brick-файла.
 * @returns Запись манифеста.
 */
async function readManifestEntry(srcDir: string, filePath: string): Promise<IBrickManifestEntry> {
    const content = await readFile(filePath, 'utf8');

    return {
        name: basename(filePath, BRICK_FILE_SUFFIX),
        category: extractCategory(content),
        brickPath: `/${relative(srcDir, filePath)}`,
    };
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

    const entries = await Promise.all(files.map((file) => readManifestEntry(srcDir, file)));
    // Порядок globby зависит от файловой системы — сортировка держит хеш стабильным
    const bricks = entries.sort((left, right) => left.brickPath.localeCompare(right.brickPath));

    const manifest: IBricksManifest = {
        bricks,
        hash: computeHash(JSON.stringify(bricks)),
    };

    await mkdir(manifestDir, { recursive: true });
    await writeFile(
        join(manifestDir, BRICKS_MANIFEST_FILENAME),
        JSON.stringify(manifest, null, 2),
        'utf8'
    );

    return manifest;
}
// #endregion
