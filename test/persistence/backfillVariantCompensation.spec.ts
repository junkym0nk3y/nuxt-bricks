/**
 * Правило компенсации backfill'а вариантов.
 *
 * Оно несимметричное, и цена ошибки в каждую сторону разная: объект без ссылки —
 * невидимый мусор, а ссылка на удалённый объект ломает галерею и опубликованные
 * страницы. Поэтому удаляется только то, о чём известно, что ссылки не будет, —
 * и это единственная логика скрипта, у которой есть четыре ветки.
 */

// #region Imports
// Vitest
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Utils
import { processRow } from '../../scripts/backfill-variants-core.mjs';
// #endregion

// #region Fakes
const BUCKET = 'my-bucket';
const ENDPOINT = 'https://storage.example.com';
const ROW_URL = `${ENDPOINT}/${BUCKET}/bricks-media/photo.png`;

/** Журналируемые зависимости скрипта: sharp, S3 и конфиг. */
function makeDeps(options: { putErrors?: (Error | null)[] } = {}): {
    deps: object;
    calls: string[];
} {
    const calls: string[] = [];
    const putErrors = options.putErrors ?? [];
    let putAttempt = 0;

    const deps = {
        // Цепочка sharp: скрипту нужен только итоговый буфер
        sharp: () => ({
            resize: () => ({
                webp: () => ({
                    toBuffer: async (): Promise<Buffer> => Buffer.from('variant'),
                }),
            }),
        }),
        s3Client: {
            async send(command: { kind: string; key: string }): Promise<void> {
                calls.push(`${command.kind}:${command.key}`);

                if (command.kind !== 'put') {
                    return;
                }

                const queuedError = putErrors[putAttempt];
                putAttempt += 1;

                if (queuedError) {
                    throw queuedError;
                }
            },
        },
        PutObjectCommand: class {
            kind = 'put';
            key: string;

            constructor(input: { Key: string }) {
                this.key = input.Key;
            }
        },
        DeleteObjectCommand: class {
            kind = 'delete';
            key: string;

            constructor(input: { Key: string }) {
                this.key = input.Key;
            }
        },
        config: {
            dryRun: false,
            s3: { bucket: BUCKET, endpoint: ENDPOINT },
        },
    };

    return { deps, calls };
}

/** Клиент БД с заданным исходом UPDATE. */
function makeClient(outcome: { rowCount?: number; error?: Error }): {
    query: (text: string, values: unknown[]) => Promise<{ rowCount: number }>;
    queries: string[];
} {
    const queries: string[] = [];

    return {
        queries,
        async query(text: string): Promise<{ rowCount: number }> {
            queries.push(text);

            if (outcome.error) {
                throw outcome.error;
            }

            return { rowCount: outcome.rowCount ?? 1 };
        },
    };
}

/** Строка медиатеки без обоих вариантов. */
function makeRow(): { id: number; url: string; preview_url: null; mock_url: null } {
    return { id: 42, url: ROW_URL, preview_url: null, mock_url: null };
}

/** Ключи, удалённые за прогон. */
function deletedKeys(calls: string[]): string[] {
    return calls.filter((call) => call.startsWith('delete:')).map((call) => call.slice(7));
}
// #endregion

describe('backfill: варианты удаляются только там, где ссылки заведомо не будет', () => {
    beforeEach(() => {
        // Скрипт рассказывает о каждом варианте и каждом откате — в выводе
        // тестов это шум
        vi.spyOn(console, 'log').mockImplementation(() => undefined);
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);

        // Скачивание исходника подменяется целиком: проверяется правило
        // компенсации, а не чтение из хранилища
        vi.stubGlobal(
            'fetch',
            async (): Promise<{ ok: boolean; body: AsyncGenerator<Uint8Array> }> => ({
                ok: true,
                body: (async function* (): AsyncGenerator<Uint8Array> {
                    yield Buffer.from('source-image');
                })(),
            })
        );
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it('успех связывает варианты с записью и ничего не удаляет', async () => {
        const { deps, calls } = makeDeps();
        const client = makeClient({ rowCount: 1 });

        expect(await processRow(deps, client, makeRow())).toBe('updated');

        expect(calls.filter((call) => call.startsWith('put:'))).toHaveLength(2);
        expect(deletedKeys(calls)).toEqual([]);
        expect(client.queries[0]).toContain('UPDATE bricks_media');
    });

    it('запись исчезла во время прохода — оба варианта удаляются', async () => {
        const { deps, calls } = makeDeps();
        const client = makeClient({ rowCount: 0 });

        expect(await processRow(deps, client, makeRow())).toBe('missing');

        // Полный файл ушёл вместе с записью, ссылки не будет никогда
        expect(deletedKeys(calls)).toEqual([
            'bricks-media/photo-42-preview.webp',
            'bricks-media/photo-42-mock.webp',
        ]);
    });

    it('неизвестный исход UPDATE варианты СОХРАНЯЕТ', async () => {
        const { deps, calls } = makeDeps();
        const client = makeClient({ error: new Error('connection terminated') });

        expect(await processRow(deps, client, makeRow())).toBe('unknown');

        // Запись могла закоммититься: удаление оставило бы её со ссылками на
        // удалённые объекты — битые превью в галерее хуже невидимого мусора
        expect(deletedKeys(calls)).toEqual([]);
    });

    it('отказ второго PUT удаляет и первый вариант, и сам отказавший', async () => {
        const putError = new Error('s3 timeout');
        const { deps, calls } = makeDeps({ putErrors: [null, putError] });
        const client = makeClient({ rowCount: 1 });

        await expect(processRow(deps, client, makeRow())).rejects.toBe(putError);

        // Ключ отказавшего PUT'а тоже в списке: отказ `send` не доказывает, что
        // объекта нет — ответ мог потеряться уже после записи
        expect(deletedKeys(calls)).toEqual([
            'bricks-media/photo-42-preview.webp',
            'bricks-media/photo-42-mock.webp',
        ]);
        expect(client.queries).toEqual([]);
    });

    it('отказ ПЕРВОГО PUT удаляет его собственный ключ', async () => {
        const putError = new Error('s3 timeout');
        const { deps, calls } = makeDeps({ putErrors: [putError] });
        const client = makeClient({ rowCount: 1 });

        await expect(processRow(deps, client, makeRow())).rejects.toBe(putError);

        expect(deletedKeys(calls)).toEqual(['bricks-media/photo-42-preview.webp']);
    });

    it('строки с одинаковым именем и разным расширением не делят ключи вариантов', async () => {
        const client = makeClient({ rowCount: 1 });
        const first = makeDeps();
        const second = makeDeps();

        await processRow(first.deps, client, { ...makeRow(), id: 42 });
        await processRow(second.deps, client, {
            ...makeRow(),
            id: 43,
            url: `${ENDPOINT}/${BUCKET}/bricks-media/photo.jpg`,
        });

        const firstKeys = first.calls.filter((call) => call.startsWith('put:'));
        const secondKeys = second.calls.filter((call) => call.startsWith('put:'));

        // Без id в ключе оба набора были бы одним и тем же `photo-preview.webp`:
        // второй проход перезаписал бы вариант первой записи, а компенсация
        // отказа удалила бы объект, на который первая уже ссылается
        expect(firstKeys).toEqual([
            'put:bricks-media/photo-42-preview.webp',
            'put:bricks-media/photo-42-mock.webp',
        ]);
        expect(secondKeys).toEqual([
            'put:bricks-media/photo-43-preview.webp',
            'put:bricks-media/photo-43-mock.webp',
        ]);
    });

    it('частичный повтор не трогает уже связанный вариант', async () => {
        // preview догнали прошлым проходом, mock — нет; его PUT отказывает
        const putError = new Error('s3 timeout');
        const { deps, calls } = makeDeps({ putErrors: [putError] });
        const client = makeClient({ rowCount: 1 });

        await expect(
            processRow(deps, client, {
                ...makeRow(),
                preview_url: `${ENDPOINT}/${BUCKET}/bricks-media/photo-42-preview.webp`,
            })
        ).rejects.toBe(putError);

        // Удаляется только ключ отказавшего mock: preview уже в записи, и его
        // удаление оставило бы ссылку на несуществующий объект
        expect(deletedKeys(calls)).toEqual(['bricks-media/photo-42-mock.webp']);
    });

    it('URL вне бакета: ни запросов к хранилищу, ни UPDATE', async () => {
        const { deps, calls } = makeDeps();
        const client = makeClient({ rowCount: 1 });

        const outcome = await processRow(deps, client, {
            ...makeRow(),
            url: 'https://cdn.example.com/foreign.png',
        });

        expect(outcome).toBe('skipped');
        expect(calls).toEqual([]);
        expect(client.queries).toEqual([]);
    });
});
