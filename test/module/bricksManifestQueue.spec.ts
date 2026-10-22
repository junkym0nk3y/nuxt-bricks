// #region Imports
// Node
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Vitest
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Utils
import {
    createBricksManifestQueue,
    generateBricksManifest,
    resolveBricksManifestDir,
} from '../../src/bricks-manifest';
import { BRICKS_MANIFEST_FILENAME } from '../../src/runtime/modules/common/constants/brickManifest';
import type { IBricksManifest } from '../../src/runtime/modules/common/types/brickManifest';
// #endregion

// #region Mocks
/**
 * Probes around the file system operations of the generator. A run parks at the
 * chosen stage (the scan — after the file list is taken, `writeFile` — before the
 * temporary file is written), so the order of operations is checked
 * deterministically, without relying on timings: `events` holds the full sequence
 * of stages of all runs.
 */
const { probe } = vi.hoisted(() => ({
    probe: {
        /** Timeline of stages: scan:start/end, write:parked/end, rename. */
        events: [] as string[],
        scanCalls: 0,
        /** Парковка прогона после снятия списка файлов. */
        scanGate: null as Promise<void> | null,
        /** Парковка прогона до записи временного файла. */
        writeGate: null as Promise<void> | null,
        /** Файлы, дописываемые к результату скана (исчезнувшие с диска). */
        extraFiles: [] as string[],
        /**
         * Return the scan list in reverse sorted order. The scan order depends on
         * the file system, so the list is first brought to a canonical one (by
         * sorting) and only then reversed: a bare `reverse()` of an unknown order
         * could happen to match the sorted one and fail to tell the
         * implementations apart.
         */
        reverseListing: false,
        /** Error for the next scan call. */
        failOnce: null as Error | null,
        renames: [] as { from: string; to: string }[],
        /** Содержимое временного файла в момент rename. */
        renameSource: null as string | null,
        /** Содержимое целевого файла в момент rename (null — его ещё нет). */
        renameTarget: null as string | null,
    },
}));

vi.mock('../../src/brick-files', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../../src/brick-files')>();

    return {
        ...actual,
        listBrickFiles: async (directory: string, suffix: string) => {
            probe.scanCalls += 1;
            probe.events.push('scan:start');

            if (probe.failOnce) {
                const error = probe.failOnce;
                probe.failOnce = null;

                throw error;
            }

            const files = await actual.listBrickFiles(directory, suffix);
            // The list is taken: files created after this stage no longer make it
            // into the current run, which is why the run parks here
            probe.events.push('scan:listed');

            if (probe.scanGate) {
                await probe.scanGate;
            }

            probe.events.push('scan:end');
            const listed = probe.reverseListing ? [...files].sort().reverse() : files;

            return [...listed, ...probe.extraFiles];
        },
    };
});

vi.mock('node:fs/promises', async (importOriginal) => {
    const actual = await importOriginal<typeof import('node:fs/promises')>();

    return {
        ...actual,
        writeFile: async (path: string, data: string, encoding: 'utf8') => {
            const isTempWrite = String(path).endsWith('.tmp');

            if (isTempWrite && probe.writeGate) {
                probe.events.push('write:parked');
                await probe.writeGate;
            }

            const result = await actual.writeFile(path, data, encoding);

            if (isTempWrite) {
                probe.events.push('write:end');
            }

            return result;
        },
        rename: async (from: string, to: string) => {
            probe.events.push('rename');
            probe.renames.push({ from: String(from), to: String(to) });
            probe.renameSource = await actual.readFile(String(from), 'utf8').catch(() => null);
            probe.renameTarget = await actual.readFile(String(to), 'utf8').catch(() => null);

            return actual.rename(from, to);
        },
    };
});
// #endregion

// #region Data
let srcDir = '';
let manifestDir = '';
let manifestPath = '';
// #endregion

// #region Methods
/**
 * Создаёт промис с внешним резолвером — управляемая парковка прогона.
 *
 * @returns Промис парковки и функция его снятия.
 */
function createGate(): { gate: Promise<void>; release: () => void } {
    let resolveGate: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
        resolveGate = () => {
            resolve();
        };
    });

    return { gate, release: () => resolveGate() };
}

/**
 * Ждёт появления стадии в хронологии прогонов.
 *
 * @param event - Имя стадии.
 */
async function waitForEvent(event: string): Promise<void> {
    for (let attempt = 0; attempt < 500; attempt += 1) {
        if (probe.events.includes(event)) {
            return;
        }

        await new Promise((resolve) => {
            setTimeout(resolve, 1);
        });
    }

    throw new Error(`Стадия ${event} не наступила`);
}

/**
 * Пишет brick-файл в `<srcDir>/components`.
 *
 * @param name - Имя файла без суффикса `.brick.ts`.
 * @param category - Значение поля category.
 * @param dataSources - Литерал `dataSources`: в манифест он не попадает, но
 * входит в хеш содержимого, поэтому им проверяется реакция хеша на правку,
 * невидимую в записях манифеста.
 */
async function writeBrickFile(name: string, category: string, dataSources = '[]'): Promise<void> {
    await writeFile(
        join(srcDir, 'components', `${name}.brick.ts`),
        `export const brick = { category: '${category}', values: {}, dataSources: ${dataSources} };\n`,
        'utf8'
    );
}

/**
 * Читает опубликованный манифест с диска.
 *
 * @returns Разобранный манифест.
 */
async function readPublishedManifest(): Promise<IBricksManifest> {
    return JSON.parse(await readFile(manifestPath, 'utf8'));
}
// #endregion

describe('манифест бриков: атомарная публикация и сериализация генерации', () => {
    beforeEach(async () => {
        srcDir = await mkdtemp(join(tmpdir(), 'bricks-manifest-'));
        await mkdir(join(srcDir, 'components'), { recursive: true });
        manifestDir = resolveBricksManifestDir(join(srcDir, '.nuxt'));
        manifestPath = join(manifestDir, BRICKS_MANIFEST_FILENAME);

        probe.events = [];
        probe.scanCalls = 0;
        probe.scanGate = null;
        probe.writeGate = null;
        probe.extraFiles = [];
        probe.reverseListing = false;
        probe.failOnce = null;
        probe.renames = [];
        probe.renameSource = null;
        probe.renameTarget = null;
    });

    afterEach(async () => {
        await rm(srcDir, { recursive: true, force: true });
    });

    it('манифест публикуется через временный файл, мусор в каталоге не остаётся', async () => {
        await writeBrickFile('CardHero', 'Cards');

        const manifest = await generateBricksManifest({ srcDir, manifestDir });

        expect(manifest.bricks).toEqual([
            {
                name: 'CardHero',
                category: 'Cards',
                brickPath: '/components/CardHero.brick.ts',
                values: {},
            },
        ]);
        expect(probe.renames).toHaveLength(1);
        expect(probe.renames[0].to).toBe(manifestPath);
        expect(probe.renames[0].from).toMatch(/manifest\.json\.\d+\.\d+\.tmp$/);
        expect(await readdir(manifestDir)).toEqual([BRICKS_MANIFEST_FILENAME]);
    });

    it('записи отсортированы по brickPath, а не по порядку скана', async () => {
        await writeBrickFile('CardTeaser', 'Cards');
        await writeBrickFile('CardHero', 'Cards');
        probe.reverseListing = true;

        const reversedScan = await generateBricksManifest({ srcDir, manifestDir });

        expect(reversedScan.bricks.map((brick) => brick.brickPath)).toEqual([
            '/components/CardHero.brick.ts',
            '/components/CardTeaser.brick.ts',
        ]);

        // File-system traversal order does not affect the contents of the answer
        probe.reverseListing = false;
        const directScan = await generateBricksManifest({ srcDir, manifestDir });

        expect(directScan.bricks).toEqual(reversedScan.bricks);
    });

    it('rename выполняется только после полной записи temp, цель до него не тронута', async () => {
        await writeBrickFile('CardHero', 'Cards');
        await generateBricksManifest({ srcDir, manifestDir });
        const previous = await readFile(manifestPath, 'utf8');

        await writeBrickFile('CardTeaser', 'Cards');
        const { gate, release } = createGate();
        probe.writeGate = gate;
        probe.renames = [];
        probe.events = [];

        const generation = generateBricksManifest({ srcDir, manifestDir });
        await waitForEvent('write:parked');

        // Запись temp ещё не выполнялась — подмены произойти не могло
        expect(probe.renames).toHaveLength(0);

        release();
        const manifest = await generation;

        expect(probe.events).toEqual([
            'scan:start',
            'scan:listed',
            'scan:end',
            'write:parked',
            'write:end',
            'rename',
        ]);
        expect(probe.renameSource).toBe(JSON.stringify(manifest, null, 2));
        expect(probe.renameTarget).toBe(previous);
        expect((await readPublishedManifest()).bricks).toHaveLength(2);
    });

    it('исчезнувший между сканом и чтением файл пропускается, а не роняет генерацию', async () => {
        await writeBrickFile('CardHero', 'Cards');
        // Имитация гонки атомарного сохранения редактора / git checkout:
        // The scan returned a path that is no longer on disk
        probe.extraFiles = [join(srcDir, 'components', 'CardGhost.brick.ts')];

        const manifest = await generateBricksManifest({ srcDir, manifestDir });

        expect(manifest.bricks.map((brick) => brick.name)).toEqual(['CardHero']);
    });

    it('прогоны не пересекаются целиком: следующий стартует только после публикации предыдущего', async () => {
        const queue = createBricksManifestQueue({ srcDir, manifestDir });
        await writeBrickFile('CardHero', 'Cards');
        const { gate, release } = createGate();
        probe.scanGate = gate;

        const first = queue.enqueue();
        const second = queue.enqueue();
        const third = queue.enqueue();

        await waitForEvent('scan:listed');

        // Пока первый прогон припаркован, второй скан не начат
        expect(probe.scanCalls).toBe(1);

        probe.scanGate = null;
        release();
        await Promise.all([first, second, third]);

        // Стадии идут строго парами: пересечения записи и публикации нет
        expect(probe.events).toEqual([
            'scan:start',
            'scan:listed',
            'scan:end',
            'write:end',
            'rename',
            'scan:start',
            'scan:listed',
            'scan:end',
            'write:end',
            'rename',
        ]);
        // Первый прогон + один догоняющий на обе поздние заявки
        expect(probe.scanCalls).toBe(2);
        expect(second).toBe(third);
        expect(second).not.toBe(first);
    });

    it('заявка во время работы получает скан, начавшийся после неё', async () => {
        const queue = createBricksManifestQueue({ srcDir, manifestDir });
        await writeBrickFile('CardHero', 'Cards');
        const { gate, release } = createGate();
        probe.scanGate = gate;

        const first = queue.enqueue();
        await waitForEvent('scan:listed');

        // Список первого прогона уже снят — этот файл может увидеть только
        // догоняющий прогон
        await writeBrickFile('CardTeaser', 'Cards');
        const second = queue.enqueue();

        probe.scanGate = null;
        release();

        expect((await first)?.bricks.map((brick) => brick.name)).toEqual(['CardHero']);
        expect((await second)?.bricks.map((brick) => brick.name)).toEqual([
            'CardHero',
            'CardTeaser',
        ]);
        expect(probe.scanCalls).toBe(2);
        expect((await readPublishedManifest()).bricks).toHaveLength(2);
    });

    it('упавший прогон не ломает очередь: следующая заявка отрабатывает', async () => {
        const queue = createBricksManifestQueue({ srcDir, manifestDir });
        probe.failOnce = new Error('EACCES');

        await expect(queue.enqueue()).rejects.toThrow('EACCES');

        await writeBrickFile('CardHero', 'Cards');

        await expect(queue.enqueue()).resolves.toMatchObject({
            bricks: [expect.objectContaining({ name: 'CardHero' })],
        });
    });

    it('dispose не возвращается раньше, чем активный прогон опубликовал манифест', async () => {
        const queue = createBricksManifestQueue({ srcDir, manifestDir });
        await writeBrickFile('CardHero', 'Cards');
        const { gate, release } = createGate();
        probe.scanGate = gate;

        const running = queue.enqueue();
        await waitForEvent('scan:listed');

        let isDisposed = false;
        const disposing = queue.dispose().then(() => {
            isDisposed = true;
        });

        await waitForEvent('scan:listed');
        expect(isDisposed).toBe(false);
        expect(probe.renames).toHaveLength(0);

        probe.scanGate = null;
        release();
        await disposing;

        // Рестарт Nuxt не начнётся, пока старый инстанс не дописал манифест
        expect(probe.renames).toHaveLength(1);
        await expect(running).resolves.toBeDefined();
        expect((await readPublishedManifest()).bricks).toHaveLength(1);
    });

    it('после dispose заявки не сканируют и не публикуют', async () => {
        const queue = createBricksManifestQueue({ srcDir, manifestDir });
        await writeBrickFile('CardHero', 'Cards');

        await queue.enqueue();
        await queue.dispose();
        // Повторный dispose безопасен
        await queue.dispose();

        await writeBrickFile('CardTeaser', 'Cards');

        await expect(queue.enqueue()).resolves.toBeUndefined();
        expect(probe.scanCalls).toBe(1);
        expect(probe.renames).toHaveLength(1);
        expect((await readPublishedManifest()).bricks).toHaveLength(1);
    });

    it('догоняющий прогон, попавший на dispose, манифест не перезаписывает', async () => {
        const queue = createBricksManifestQueue({ srcDir, manifestDir });
        await writeBrickFile('CardHero', 'Cards');
        const { gate, release } = createGate();
        probe.scanGate = gate;

        const running = queue.enqueue();
        await waitForEvent('scan:listed');
        const catchUp = queue.enqueue();

        const disposing = queue.dispose();
        probe.scanGate = null;
        release();
        await disposing;

        await expect(running).resolves.toBeDefined();
        await expect(catchUp).resolves.toBeUndefined();
        expect(probe.scanCalls).toBe(1);
        expect(probe.renames).toHaveLength(1);
        expect((await readPublishedManifest()).bricks).toHaveLength(1);
    });
});
