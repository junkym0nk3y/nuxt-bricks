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
 * Пробы вокруг ФС-операций генератора. Прогон парковывается на выбранной стадии
 * (`globby` — после снятия списка файлов, `writeFile` — до записи временного
 * файла), поэтому порядок операций проверяется детерминированно, без опоры на
 * тайминги: `events` хранит полную последовательность стадий всех прогонов.
 */
const { probe } = vi.hoisted(() => ({
    probe: {
        /** Хронология стадий: globby:start/end, write:parked/end, rename. */
        events: [] as string[],
        globbyCalls: 0,
        /** Парковка прогона после снятия списка файлов. */
        globbyGate: null as Promise<void> | null,
        /** Парковка прогона до записи временного файла. */
        writeGate: null as Promise<void> | null,
        /** Файлы, дописываемые к результату скана (исчезнувшие с диска). */
        extraFiles: [] as string[],
        /**
         * Отдать список скана обратно отсортированным. Порядок globby зависит от
         * ФС, поэтому список сначала приводится к каноническому (сортировкой), и
         * только потом переворачивается: просто `reverse()` от неизвестного
         * порядка мог бы случайно совпасть с отсортированным и не различить
         * реализации.
         */
        reverseListing: false,
        /** Ошибка для следующего вызова globby. */
        failOnce: null as Error | null,
        renames: [] as { from: string; to: string }[],
        /** Содержимое временного файла в момент rename. */
        renameSource: null as string | null,
        /** Содержимое целевого файла в момент rename (null — его ещё нет). */
        renameTarget: null as string | null,
    },
}));

vi.mock('globby', async (importOriginal) => {
    const actual = await importOriginal<typeof import('globby')>();

    return {
        ...actual,
        globby: async (
            patterns: Parameters<typeof actual.globby>[0],
            options?: Parameters<typeof actual.globby>[1]
        ) => {
            probe.globbyCalls += 1;
            probe.events.push('globby:start');

            if (probe.failOnce) {
                const error = probe.failOnce;
                probe.failOnce = null;

                throw error;
            }

            const files = await actual.globby(patterns, options);
            // Список снят: файлы, созданные после этой стадии, в текущий прогон
            // уже не попадут — на неё и парковываемся
            probe.events.push('globby:listed');

            if (probe.globbyGate) {
                await probe.globbyGate;
            }

            probe.events.push('globby:end');
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
        probe.globbyCalls = 0;
        probe.globbyGate = null;
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

    it('записи отсортированы по brickPath, хеш не зависит от порядка скана', async () => {
        await writeBrickFile('CardTeaser', 'Cards');
        await writeBrickFile('CardHero', 'Cards');
        probe.reverseListing = true;

        const reversedScan = await generateBricksManifest({ srcDir, manifestDir });

        expect(reversedScan.bricks.map((brick) => brick.brickPath)).toEqual([
            '/components/CardHero.brick.ts',
            '/components/CardTeaser.brick.ts',
        ]);

        // Тот же диск, порядок скана прямой — хеш обязан совпасть
        probe.reverseListing = false;
        const directScan = await generateBricksManifest({ srcDir, manifestDir });

        expect(directScan.hash).toBe(reversedScan.hash);
    });

    it('хеш меняется от правки внутри brick-файла, хотя записи манифеста те же', async () => {
        await writeBrickFile('CardHero', 'Cards', '[{ name: "old" }]');
        const before = await generateBricksManifest({ srcDir, manifestDir });

        // Записи манифеста неизменны: dataSources читает рендерер прямо из
        // модуля, в манифест они не попадают
        await writeBrickFile('CardHero', 'Cards', '[{ name: "new" }]');
        const after = await generateBricksManifest({ srcDir, manifestDir });

        expect(after.bricks).toEqual(before.bricks);
        // Хеш по инвентарю записей на этой правке не менялся, то есть по нему
        // нельзя было отличить правку файла от повторного скана — ради этого
        // хеш и считается от исходников
        expect(after.hash).not.toBe(before.hash);
    });

    it('повторный скан без правок даёт тот же хеш', async () => {
        await writeBrickFile('CardHero', 'Cards', '[{ name: "same" }]');

        const first = await generateBricksManifest({ srcDir, manifestDir });
        const second = await generateBricksManifest({ srcDir, manifestDir });

        // Иначе сверка хешей считала бы изменением каждое событие вотчера
        expect(second.hash).toBe(first.hash);
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
            'globby:start',
            'globby:listed',
            'globby:end',
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
        // globby отдал путь, которого на диске уже нет
        probe.extraFiles = [join(srcDir, 'components', 'CardGhost.brick.ts')];

        const manifest = await generateBricksManifest({ srcDir, manifestDir });

        expect(manifest.bricks.map((brick) => brick.name)).toEqual(['CardHero']);
    });

    it('прогоны не пересекаются целиком: следующий стартует только после публикации предыдущего', async () => {
        const queue = createBricksManifestQueue({ srcDir, manifestDir });
        await writeBrickFile('CardHero', 'Cards');
        const { gate, release } = createGate();
        probe.globbyGate = gate;

        const first = queue.enqueue();
        const second = queue.enqueue();
        const third = queue.enqueue();

        await waitForEvent('globby:listed');

        // Пока первый прогон припаркован, второй скан не начат
        expect(probe.globbyCalls).toBe(1);

        probe.globbyGate = null;
        release();
        await Promise.all([first, second, third]);

        // Стадии идут строго парами: пересечения записи и публикации нет
        expect(probe.events).toEqual([
            'globby:start',
            'globby:listed',
            'globby:end',
            'write:end',
            'rename',
            'globby:start',
            'globby:listed',
            'globby:end',
            'write:end',
            'rename',
        ]);
        // Первый прогон + один догоняющий на обе поздние заявки
        expect(probe.globbyCalls).toBe(2);
        expect(second).toBe(third);
        expect(second).not.toBe(first);
    });

    it('заявка во время работы получает скан, начавшийся после неё', async () => {
        const queue = createBricksManifestQueue({ srcDir, manifestDir });
        await writeBrickFile('CardHero', 'Cards');
        const { gate, release } = createGate();
        probe.globbyGate = gate;

        const first = queue.enqueue();
        await waitForEvent('globby:listed');

        // Список первого прогона уже снят — этот файл может увидеть только
        // догоняющий прогон
        await writeBrickFile('CardTeaser', 'Cards');
        const second = queue.enqueue();

        probe.globbyGate = null;
        release();

        expect((await first)?.bricks.map((brick) => brick.name)).toEqual(['CardHero']);
        expect((await second)?.bricks.map((brick) => brick.name)).toEqual([
            'CardHero',
            'CardTeaser',
        ]);
        expect(probe.globbyCalls).toBe(2);
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
        probe.globbyGate = gate;

        const running = queue.enqueue();
        await waitForEvent('globby:listed');

        let isDisposed = false;
        const disposing = queue.dispose().then(() => {
            isDisposed = true;
        });

        await waitForEvent('globby:listed');
        expect(isDisposed).toBe(false);
        expect(probe.renames).toHaveLength(0);

        probe.globbyGate = null;
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
        expect(probe.globbyCalls).toBe(1);
        expect(probe.renames).toHaveLength(1);
        expect((await readPublishedManifest()).bricks).toHaveLength(1);
    });

    it('догоняющий прогон, попавший на dispose, манифест не перезаписывает', async () => {
        const queue = createBricksManifestQueue({ srcDir, manifestDir });
        await writeBrickFile('CardHero', 'Cards');
        const { gate, release } = createGate();
        probe.globbyGate = gate;

        const running = queue.enqueue();
        await waitForEvent('globby:listed');
        const catchUp = queue.enqueue();

        const disposing = queue.dispose();
        probe.globbyGate = null;
        release();
        await disposing;

        await expect(running).resolves.toBeDefined();
        await expect(catchUp).resolves.toBeUndefined();
        expect(probe.globbyCalls).toBe(1);
        expect(probe.renames).toHaveLength(1);
        expect((await readPublishedManifest()).bricks).toHaveLength(1);
    });
});
