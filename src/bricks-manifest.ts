/**
 * Build-time scan of the consumer brick components and the manifest write (see
 * src/module.ts): called from the `build:before` hook and from the dev watcher
 * on `builder:watch`.
 */
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { basename, isAbsolute, join, relative } from 'pathe';
import { extractBrickMetadata } from './brick-metadata';
import { isMissingFileError, listBrickFiles } from './brick-files';
import {
    BRICKS_MANIFEST_DIR,
    BRICKS_MANIFEST_FILENAME,
} from './runtime/modules/common/constants/brickManifest';
import type {
    IBrickManifestEntry,
    IBricksManifest,
} from './runtime/modules/common/types/brickManifest';
import type { IBricksManifestOptions, IBricksManifestQueue } from './types/bricksManifest';

// #region Constants
const BRICK_FILE_SUFFIX = '.brick.ts';

/**
 * The single scan directory for brick files, relative to `srcDir`.
 * On Nuxt 3 srcDir equals rootDir, on Nuxt 4 it is `<rootDir>/app`, on the
 * playground `<repo>/playground`; in all three the loader key comes out the same
 * (`/components/…`), so there is no longer any need to strip `app/` or
 * `playground/` prefixes and try path variants.
 *
 * The equality "loader map key == `/` + path from `srcDir`" rests on the standard
 * `vite.root === srcDir` and on there being a single scan directory. Directories
 * from `components.dirs`, Nuxt layers, other Nuxt modules and npm packages are
 * deliberately out of the map — the supported scope is listed in the README.
 */
const BRICK_COMPONENTS_DIR = 'components';

/**
 * Suffix of the temporary file of an atomic publish. The manifest directory is
 * mounted as a Nitro server asset, so the same suffix builds the `ignore` of
 * that mount (see `src/module.ts`) — otherwise the temporary file would become a
 * namespace key.
 */
export const BRICKS_MANIFEST_TEMP_SUFFIX = '.tmp';

/**
 * Counter of publish temporary files: the name has to be unique within the
 * process, otherwise two runs (the dev watcher and the `build:before` of a new
 * Nuxt instance) would write into one and the same temporary file.
 */
let publishCounter = 0;
// #endregion

// #region Methods
/**
 * Whether the path falls into the brick-file scan scope.
 *
 * The scope is the same as that of the manifest scan: only `<srcDir>/components/**`.
 * A `*.brick.ts` in another directory never reaches the manifest, so there is no
 * reason for the dev watcher to react to it either. The `builder:watch` hook
 * hands the path over either absolute or relative to `srcDir`
 * (`experimental.relativeWatchPaths`) — POSIX-normalized in both cases.
 *
 * @param srcDir - `nuxt.options.srcDir`.
 * @param path - Path from the watcher event.
 * @returns Whether it is a brick file within the scan scope.
 */
export function isBrickFilePath(srcDir: string, path: string): boolean {
    const relativePath = isAbsolute(path) ? relative(srcDir, path) : path;

    return (
        relativePath.startsWith(`${BRICK_COMPONENTS_DIR}/`) &&
        relativePath.endsWith(BRICK_FILE_SUFFIX)
    );
}

/**
 * Builds the absolute path of the manifest directory inside buildDir.
 *
 * @param buildDir - `nuxt.options.buildDir`.
 * @returns Absolute path of the directory.
 */
export function resolveBricksManifestDir(buildDir: string): string {
    return join(buildDir, BRICKS_MANIFEST_DIR);
}

/**
 * Reads one brick file and turns it into a manifest entry.
 *
 * A file that disappeared between the scan and `readFile` is skipped: an atomic
 * save from an editor, a `git checkout` or a directory removal produce exactly
 * that race, and the whole scan (and in dev the process) must not fall over
 * because of it. The removal will arrive as a separate watcher event anyway and
 * regenerate the manifest.
 *
 * A metadata parse error, on the contrary, propagates: a brick silently written
 * into the manifest without properties would look sound, and its properties
 * panel would read as though the author had meant it to be empty.
 *
 * @param srcDir - `nuxt.options.srcDir` (base of the loader key).
 * @param filePath - Absolute path of the brick file.
 * @returns Manifest entry, or `null` when the file is gone.
 */
async function readManifestEntry(
    srcDir: string,
    filePath: string
): Promise<IBrickManifestEntry | null> {
    let content: string;

    try {
        content = await readFile(filePath, 'utf8');
    } catch (error) {
        if (isMissingFileError(error)) {
            return null;
        }

        throw error;
    }

    const metadata = extractBrickMetadata(filePath, content);

    return {
        name: basename(filePath, BRICK_FILE_SUFFIX),
        brickPath: `/${relative(srcDir, filePath)}`,
        ...metadata,
    };
}

/**
 * Publishes the manifest atomically: a write into a temporary file next to the
 * target one plus a `rename`. The `/api/bricks/components` handler reads the file
 * whole, so it must never see half-written JSON; the temporary file lies in the
 * same directory, otherwise `rename` would stop being atomic.
 *
 * @param manifestDir - Manifest directory.
 * @param manifest - The manifest being published.
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
        // An interrupted publish must not leave litter in buildDir
        await rm(tempPath, { force: true });

        throw error;
    }
}

/**
 * Scans `<srcDir>/components` for brick files and writes the manifest.
 * The write is unconditional: an empty result is saved too, otherwise removing
 * the last brick would leave a stale list on disk.
 *
 * @param options - srcDir and the manifest directory.
 * @returns The manifest that was written.
 */
export async function generateBricksManifest(
    options: IBricksManifestOptions
): Promise<IBricksManifest> {
    const { srcDir, manifestDir } = options;

    const files = await listBrickFiles(join(srcDir, BRICK_COMPONENTS_DIR), BRICK_FILE_SUFFIX);

    const entries = await Promise.all(files.map((file) => readManifestEntry(srcDir, file)));
    // The scan order depends on the file system — sorting keeps the order of
    // entries stable
    const manifest: IBricksManifest = {
        bricks: entries
            .filter((entry): entry is IBrickManifestEntry => entry !== null)
            .toSorted((left, right) => left.brickPath.localeCompare(right.brickPath)),
    };

    await publishManifest(manifestDir, manifest);

    return manifest;
}

/**
 * Creates a serialized manifest generation queue.
 *
 * Nuxt fires `builder:watch` as a separate `callHook` for every watcher event and
 * does not await the result, so without a queue two quick saves (an atomic editor
 * write, format-on-save, a `git checkout`) give two concurrent scans — and the
 * older of them could be the one that finishes writing the manifest.
 *
 * No more than one scan runs at a time; every request that arrives while one is
 * running is coalesced into a single catch-up run — it rereads the file system
 * anyway, so intermediate passes add nothing.
 *
 * @param options - srcDir and the manifest directory.
 * @returns The generation queue.
 */
export function createBricksManifestQueue(options: IBricksManifestOptions): IBricksManifestQueue {
    let running: Promise<IBricksManifest | undefined> | null = null;
    let queued: Promise<IBricksManifest | undefined> | null = null;
    let isDisposed = false;

    /**
     * A promise that settles together with the original one but never rejects: a
     * failed run must neither break the chain nor leave a rejection without a
     * handler.
     *
     * @param promise - The original promise.
     * @returns A promise that does not reject.
     */
    function settle(promise: Promise<unknown>): Promise<void> {
        return promise.then(
            () => undefined,
            () => undefined
        );
    }

    /**
     * Starts a run and clears the "running" marker once it settles.
     *
     * @returns Promise of the run.
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
     * Queues a generation run.
     *
     * @returns Manifest of the run, or `undefined` when the queue is closed.
     */
    function enqueue(): Promise<IBricksManifest | undefined> {
        if (isDisposed) {
            return Promise.resolve(undefined);
        }

        // The catch-up run has not started yet — it will see the same files
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
     * Closes the queue.
     *
     * @returns Promise that settles with the unfinished scan.
     */
    async function dispose(): Promise<void> {
        isDisposed = true;

        // The scan of the old Nuxt instance must not rename its temporary file
        // over the manifest of the new one: the close hook is called before that
        // instance runs build:before
        await settle(queued ?? running ?? Promise.resolve());
    }

    return { enqueue, dispose };
}
// #endregion
