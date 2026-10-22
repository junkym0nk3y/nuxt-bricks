/**
 * Listing of the consumer brick files: the scan behind the build-time manifest
 * (see src/bricks-manifest.ts).
 *
 * A hand-written walk rather than a glob library. The scope has one fixed shape —
 * files with one suffix anywhere under one directory — and the libraries that
 * cover it either pull `braces` into the dependencies of the package (`globby`,
 * through `fast-glob` and `micromatch`, with a vulnerability that has no fixed
 * version) or swallow the errors of the walk (`tinyglobby` crawls with `fdir`,
 * which suppresses them and offers no way to turn that off). A swallowed EACCES
 * would publish a manifest without the bricks of the unreadable directory, and
 * nothing would say so.
 *
 * The walk keeps the behavior of the glob it replaces: entries whose name starts
 * with a dot are skipped, symbolic links are followed, an entry that is gone
 * (a missing scan root, a directory removed in the middle of the walk, a dangling
 * link) counts as empty, and every other error of the file system rejects the scan.
 */
import { readdir, realpath, stat } from 'node:fs/promises';
import { join } from 'pathe';

// #region Methods
/**
 * Whether the entry is gone: it vanished between the listing of its directory
 * and the access, or the link points nowhere.
 *
 * @param error - Error of the file operation.
 * @returns Whether it is ENOENT.
 */
export function isMissingFileError(error: unknown): error is Error {
    return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

/**
 * Settles a file operation, turning ENOENT into `null` and rethrowing the rest.
 *
 * @param operation - The pending operation.
 * @returns Its result, or `null` when the entry is gone.
 */
async function unlessMissing<T>(operation: Promise<T>): Promise<T | null> {
    try {
        return await operation;
    } catch (error) {
        if (isMissingFileError(error)) {
            return null;
        }

        throw error;
    }
}

/**
 * Walks one directory. The real paths of the directories on the way down guard
 * against link cycles: a link back to any of them would otherwise be walked until
 * the path grows past the limit of the file system. Comparing the paths as walked
 * is not enough — two links pointing at each other never repeat a walked path.
 *
 * @param directory - Absolute path of the directory as walked.
 * @param suffix - File name suffix to collect.
 * @param ancestors - Real paths of the directories above this one.
 * @returns Absolute paths of the matching files.
 */
async function walk(
    directory: string,
    suffix: string,
    ancestors: ReadonlySet<string>
): Promise<string[]> {
    const realDirectory = await unlessMissing(realpath(directory));

    if (realDirectory === null || ancestors.has(realDirectory)) {
        return [];
    }

    const entries = (await unlessMissing(readdir(directory, { withFileTypes: true }))) ?? [];
    const lineage = new Set([...ancestors, realDirectory]);
    const nested = await Promise.all(
        entries
            .filter((entry) => !entry.name.startsWith('.'))
            .map(async (entry) => {
                const path = join(directory, entry.name);
                const target = entry.isSymbolicLink() ? await unlessMissing(stat(path)) : entry;

                if (target?.isDirectory()) {
                    return walk(path, suffix, lineage);
                }

                return target?.isFile() && entry.name.endsWith(suffix) ? [path] : [];
            })
    );

    return nested.flat();
}

/**
 * Lists the files with the given suffix anywhere under the directory.
 * The order is that of the file system; a caller that needs a stable one sorts.
 *
 * @param directory - Absolute path of the scan root.
 * @param suffix - File name suffix to collect.
 * @returns Absolute paths of the matching files.
 */
export function listBrickFiles(directory: string, suffix: string): Promise<string[]> {
    return walk(directory, suffix, new Set());
}
// #endregion
