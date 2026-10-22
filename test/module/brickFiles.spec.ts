/**
 * The walk that lists brick files for the manifest. It replaced a glob library, so the
 * cases pin the behavior of that glob — dot entries skipped, links followed, a missing
 * root empty — plus what the glob did not offer: a failure to read a directory rejects
 * the scan instead of dropping the bricks inside it from the manifest.
 */

// #region Imports
// Node
import { chmod, mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

// Vitest
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Utils
import { listBrickFiles } from '../../src/brick-files';
// #endregion

// #region Mocks
/**
 * A directory removed between its resolution and its listing. The race cannot be timed
 * on a real file system, so the listing of the directory with this name answers ENOENT.
 */
const VANISHING_DIR = 'vanishing';

vi.mock('node:fs/promises', async (importOriginal) => {
    const actual = await importOriginal<typeof import('node:fs/promises')>();

    return {
        ...actual,
        readdir: (...args: Parameters<typeof actual.readdir>) =>
            String(args[0]).endsWith(`/${VANISHING_DIR}`)
                ? Promise.reject(Object.assign(new Error('gone'), { code: 'ENOENT' }))
                : actual.readdir(...args),
    };
});
// #endregion

const SUFFIX = '.brick.ts';

/** Symbolic links need privileges on Windows, and root reads a directory with no permissions */
const CAN_LINK = process.platform !== 'win32';
const CAN_LOCK = CAN_LINK && process.getuid?.() !== 0;

let root = '';

/**
 * Creates an empty file, with its directories.
 *
 * @param relativePath - Path under the temporary root.
 */
async function touch(relativePath: string): Promise<void> {
    const path = join(root, relativePath);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, '');
}

/**
 * Lists the brick files under `components` of the temporary root.
 *
 * @returns Paths relative to the root, sorted.
 */
async function listRelative(): Promise<string[]> {
    const files = await listBrickFiles(join(root, 'components'), SUFFIX);

    return files.map((file) => file.slice(root.length + 1)).sort();
}

beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'bricks-files-'));
});

afterEach(async () => {
    await rm(root, { recursive: true, force: true });
});

describe('listBrickFiles', () => {
    it('collects the files with the suffix at any depth', async () => {
        await touch('components/Hero.brick.ts');
        await touch('components/promo/deep/Banner.brick.ts');
        await touch('components/promo/Banner.vue');
        await touch('components/Old.brick.ts.bak');
        await touch('Outside.brick.ts');

        expect(await listRelative()).toEqual([
            'components/Hero.brick.ts',
            'components/promo/deep/Banner.brick.ts',
        ]);
    });

    it('skips the entries whose name starts with a dot', async () => {
        await touch('components/.drafts/Draft.brick.ts');
        await touch('components/.Hidden.brick.ts');
        await touch('components/Visible.brick.ts');

        expect(await listRelative()).toEqual(['components/Visible.brick.ts']);
    });

    it('treats a missing scan root as an empty scope', async () => {
        expect(await listRelative()).toEqual([]);
    });

    it('treats a directory removed in the middle of the walk as empty', async () => {
        await touch(`components/${VANISHING_DIR}/Removed.brick.ts`);
        await touch('components/Kept.brick.ts');

        expect(await listRelative()).toEqual(['components/Kept.brick.ts']);
    });

    it('walks a directory named with the suffix instead of listing it', async () => {
        await touch('components/Odd.brick.ts/Inner.brick.ts');

        expect(await listRelative()).toEqual(['components/Odd.brick.ts/Inner.brick.ts']);
    });

    it.runIf(CAN_LINK)('follows links to directories and to files', async () => {
        await touch('shared/Card.brick.ts');
        await touch('single/Badge.brick.ts');
        await mkdir(join(root, 'components'));
        await symlink(join(root, 'shared'), join(root, 'components/shared'), 'dir');
        await symlink(join(root, 'single/Badge.brick.ts'), join(root, 'components/Badge.brick.ts'));

        expect(await listRelative()).toEqual([
            'components/Badge.brick.ts',
            'components/shared/Card.brick.ts',
        ]);
    });

    it.runIf(CAN_LINK)('skips a link that points nowhere', async () => {
        await touch('components/Kept.brick.ts');
        await symlink(join(root, 'gone.brick.ts'), join(root, 'components/Gone.brick.ts'));

        expect(await listRelative()).toEqual(['components/Kept.brick.ts']);
    });

    it.runIf(CAN_LINK)('stops at a link back to a directory above', async () => {
        await touch('components/nested/Hero.brick.ts');
        await symlink(join(root, 'components'), join(root, 'components/nested/loop'), 'dir');

        expect(await listRelative()).toEqual(['components/nested/Hero.brick.ts']);
    });

    it.runIf(CAN_LINK)('stops at two links pointing at each other', async () => {
        await touch('components/a/A.brick.ts');
        await touch('components/b/B.brick.ts');
        await symlink(join(root, 'components/b'), join(root, 'components/a/to-b'), 'dir');
        await symlink(join(root, 'components/a'), join(root, 'components/b/to-a'), 'dir');

        expect(await listRelative()).toEqual([
            'components/a/A.brick.ts',
            'components/a/to-b/B.brick.ts',
            'components/b/B.brick.ts',
            'components/b/to-a/A.brick.ts',
        ]);
    });

    it.runIf(CAN_LOCK)('rejects when a directory cannot be read', async () => {
        await touch('components/Open.brick.ts');
        await touch('components/locked/Hidden.brick.ts');
        await chmod(join(root, 'components/locked'), 0o000);

        try {
            await expect(listRelative()).rejects.toMatchObject({ code: 'EACCES' });
        } finally {
            await chmod(join(root, 'components/locked'), 0o755);
        }
    });
});
