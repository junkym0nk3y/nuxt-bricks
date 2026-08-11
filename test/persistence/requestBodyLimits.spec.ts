// #region Imports
// Types
import type { H3Event } from 'h3';
import type { IUploadedFilePart } from '../../src/runtime/modules/persistence/types/media';
import type { IInflightBodyBudget } from '../../src/runtime/modules/persistence/types/requestBodyLimits';

// Vitest
import { describe, expect, it } from 'vitest';

// Utils
import {
    collectStreamWithLimit,
    collectWebStreamWithLimit,
    createInflightBodyBudget,
    parseMultipartBuffer,
    withMultipartFormData,
} from '../../src/runtime/modules/persistence/server/utils/requestBodyLimits';
// #endregion

/**
 * Async-генератор чанков с учётом фактически отданных (проверка раннего обрыва).
 */
function createChunkSource(chunks: string[]): {
    source: AsyncGenerator<Uint8Array>;
    yielded: () => number;
} {
    let yielded = 0;

    async function* generate(): AsyncGenerator<Uint8Array> {
        for (const chunk of chunks) {
            yielded += 1;
            yield Buffer.from(chunk);
        }
    }

    return { source: generate(), yielded: () => yielded };
}

/**
 * Собирает multipart/form-data тело с файлом и текстовым полем.
 */
function buildMultipartBody(boundary: string): Uint8Array<ArrayBuffer> {
    return new TextEncoder().encode(
        [
            `--${boundary}`,
            'Content-Disposition: form-data; name="file"; filename="a.png"',
            'Content-Type: image/png',
            '',
            'PNGDATA',
            `--${boundary}`,
            'Content-Disposition: form-data; name="category"',
            '',
            'images',
            `--${boundary}--`,
            '',
        ].join('\r\n')
    );
}

/**
 * Фейковое событие запроса: тело — async-генератор чанков, заголовки читаются
 * штатным `getHeader` (он смотрит в `event.node.req.headers`).
 */
function createFakeEvent(
    chunks: string[],
    headers: Record<string, string>
): { event: H3Event; yielded: () => number } {
    const { source, yielded } = createChunkSource(chunks);
    const req = Object.assign(source, { headers });

    return { event: { node: { req } } as unknown as H3Event, yielded };
}

/** Тело multipart-формы одной строкой и его точная длина. */
function buildMultipartRequest(boundary: string): { body: string; length: number } {
    const body = Buffer.from(buildMultipartBody(boundary)).toString('utf8');

    return { body, length: Buffer.byteLength(body) };
}

/**
 * Читает форму, ничего с ней не делая: обработчик отдаёт части наружу, поэтому
 * резерв снимается ровно на выходе из него.
 */
function readParts(
    event: H3Event,
    maxBytes: number,
    budget: IInflightBodyBudget
): Promise<IUploadedFilePart[]> {
    return withMultipartFormData(event, maxBytes, async (parts) => parts, budget);
}

describe('requestBodyLimits: лимитированное чтение тела', () => {
    it('collectStreamWithLimit конкатенирует чанки в пределах лимита', async () => {
        const { source } = createChunkSource(['abc', 'def', 'gh']);
        const buffer = await collectStreamWithLimit(source, 100, () => new Error('over'));

        expect(buffer.toString()).toBe('abcdefgh');
    });

    it('collectStreamWithLimit обрывает чтение сразу при превышении', async () => {
        const { source, yielded } = createChunkSource(['aaaa', 'bbbb', 'cccc']);

        await expect(collectStreamWithLimit(source, 6, () => new Error('over'))).rejects.toThrow(
            'over'
        );
        // Третий чанк не читался: превышение обнаружено на втором
        expect(yielded()).toBe(2);
    });

    it('collectWebStreamWithLimit читает web-стрим и уважает лимит', async () => {
        const buildStream = (): ReadableStream<Uint8Array> =>
            new ReadableStream<Uint8Array>({
                start(controller) {
                    controller.enqueue(Buffer.from('hello '));
                    controller.enqueue(Buffer.from('world'));
                    controller.close();
                },
            });

        const buffer = await collectWebStreamWithLimit(buildStream(), 100, () => new Error('over'));
        expect(buffer.toString()).toBe('hello world');

        await expect(
            collectWebStreamWithLimit(buildStream(), 5, () => new Error('over'))
        ).rejects.toThrow('over');
    });

    it('parseMultipartBuffer разбирает файловые и текстовые части', async () => {
        const boundary = 'test-boundary-42';
        const parts = await parseMultipartBuffer(
            buildMultipartBody(boundary),
            `multipart/form-data; boundary=${boundary}`
        );

        expect(parts).toHaveLength(2);

        const file = parts.find((part) => part.name === 'file');
        expect(file?.filename).toBe('a.png');
        expect(file?.type).toBe('image/png');
        expect(file?.data.toString()).toBe('PNGDATA');

        const category = parts.find((part) => part.name === 'category');
        expect(category?.filename).toBeUndefined();
        expect(category?.data.toString()).toBe('images');
    });

    it('parseMultipartBuffer отвечает 400 на битое тело', async () => {
        await expect(
            parseMultipartBuffer(
                new TextEncoder().encode('definitely not multipart'),
                'multipart/form-data'
            )
        ).rejects.toMatchObject({ statusCode: 400 });
    });
});

/**
 * Бюджет одновременного буферизования: лимит запросов в минуту не ограничивает
 * их одновременность, а тело каждой формы собирается в память целиком.
 */
describe('requestBodyLimits: бюджет одновременного буферизования', () => {
    it('отклоняет 503, когда места в бюджете нет, и возвращает его освобождением', () => {
        const budget = createInflightBodyBudget(100);
        const release = budget.reserve(70);

        expect(() => budget.reserve(40)).toThrow(expect.objectContaining({ statusCode: 503 }));

        release();

        expect(() => budget.reserve(40)).not.toThrow();
    });

    it('освобождение идемпотентно: потолок не уезжает вверх от повторного вызова', () => {
        const budget = createInflightBodyBudget(100);
        const release = budget.reserve(60);

        release();
        release();
        budget.reserve(60);

        // Второй резерв занял бюджет целиком; если бы повторное освобождение
        // «вернуло» ещё 60 байт, третий тоже прошёл бы
        expect(() => budget.reserve(60)).toThrow(expect.objectContaining({ statusCode: 503 }));
    });

    it('одинокий запрос больше бюджета проходит: иначе ручка не работала бы вовсе', () => {
        const budget = createInflightBodyBudget(10);

        expect(() => budget.reserve(1000)).not.toThrow();
    });

    it('форма читается в пределах бюджета и освобождает его после разбора', async () => {
        const boundary = 'budget-boundary';
        const { body, length } = buildMultipartRequest(boundary);
        const budget = createInflightBodyBudget(length);
        const headers = {
            'content-type': `multipart/form-data; boundary=${boundary}`,
            'content-length': String(length),
        };

        const first = createFakeEvent([body], headers);
        expect(await readParts(first.event, length * 10, budget)).toHaveLength(2);

        // Бюджет ровно на одно тело: вторая форма проходит только потому, что
        // резерв первой снят — и снят он лишь после того, как обработчик первой
        // закончил работу с её буферами
        const second = createFakeEvent([body], headers);
        expect(await readParts(second.event, length * 10, budget)).toHaveLength(2);
    });

    it('резерв держится всю обработку, а не только чтение и разбор', async () => {
        const boundary = 'holding-boundary';
        const { body, length } = buildMultipartRequest(boundary);
        const budget = createInflightBodyBudget(length);
        const headers = {
            'content-type': `multipart/form-data; boundary=${boundary}`,
            'content-length': String(length),
        };

        let releaseHandler: (() => void) | undefined;
        let signalStarted: (() => void) | undefined;
        const handlerStarted = new Promise<void>((resolve) => {
            signalStarted = resolve;
        });
        const first = createFakeEvent([body], headers);
        const slow = withMultipartFormData(
            first.event,
            length * 10,
            async () => {
                signalStarted?.();

                return new Promise<void>((resolve) => {
                    releaseHandler = resolve;
                });
            },
            budget
        );

        await handlerStarted;

        // Обработчик ещё держит буферы формы (в ручке на этом месте идут sharp и
        // заливка в хранилище) — вторая форма в бюджет не влезает
        const second = createFakeEvent([body], headers);
        await expect(readParts(second.event, length * 10, budget)).rejects.toMatchObject({
            statusCode: 503,
        });

        releaseHandler?.();
        await slow;

        // Обработчик закончил — место освободилось
        const third = createFakeEvent([body], headers);
        expect(await readParts(third.event, length * 10, budget)).toHaveLength(2);
    });

    it('исключение обработчика возвращает место в бюджете и не подменяется', async () => {
        const boundary = 'throwing-boundary';
        const { body, length } = buildMultipartRequest(boundary);
        const budget = createInflightBodyBudget(length);
        const headers = {
            'content-type': `multipart/form-data; boundary=${boundary}`,
            'content-length': String(length),
        };
        const failure = new Error('sharp упал на этом файле');

        const first = createFakeEvent([body], headers);

        // В ручке так выглядит любой отказ обработки: sharp, хранилище, БД
        await expect(
            withMultipartFormData(
                first.event,
                length * 10,
                async () => {
                    throw failure;
                },
                budget
            )
        ).rejects.toBe(failure);

        // Бюджет ровно на одно тело: следующая форма пройдёт только если резерв
        // упавшего обработчика снят
        const second = createFakeEvent([body], headers);
        expect(await readParts(second.event, length * 10, budget)).toHaveLength(2);
    });

    it('заявленный размер выше потолка отклоняется 413 даже при занятом бюджете', async () => {
        const boundary = 'oversized-boundary';
        const { body, length } = buildMultipartRequest(boundary);
        const budget = createInflightBodyBudget(length);
        budget.reserve(length);

        const oversized = createFakeEvent([body], {
            'content-type': `multipart/form-data; boundary=${boundary}`,
            'content-length': String(length * 5),
        });

        // Порядок именно такой: запрос, который никогда не станет валидным,
        // получает стабильный 413, а не 503 с предложением повторить
        await expect(readParts(oversized.event, length, budget)).rejects.toMatchObject({
            statusCode: 413,
        });
        expect(oversized.yielded()).toBe(0);
    });

    it('занятый бюджет отклоняет форму, не начав читать тело', async () => {
        const boundary = 'busy-boundary';
        const { body, length } = buildMultipartRequest(boundary);
        const budget = createInflightBodyBudget(length);
        budget.reserve(length);

        const busy = createFakeEvent([body], {
            'content-type': `multipart/form-data; boundary=${boundary}`,
            'content-length': String(length),
        });

        await expect(readParts(busy.event, length * 10, budget)).rejects.toMatchObject({
            statusCode: 503,
        });
        expect(busy.yielded()).toBe(0);
    });

    it('заявленная длина ограничивает и чтение: соврать в Content-Length бюджет не обойти', async () => {
        const boundary = 'lying-boundary';
        const { body, length } = buildMultipartRequest(boundary);
        const budget = createInflightBodyBudget(length * 10);

        // Клиент заявил один байт, а присылает всё тело: без потолка по резерву
        // он занял бы в бюджете байт, а в памяти — весь потолок ручки
        const lying = createFakeEvent([body], {
            'content-type': `multipart/form-data; boundary=${boundary}`,
            'content-length': '1',
        });

        await expect(readParts(lying.event, length * 10, budget)).rejects.toMatchObject({
            statusCode: 413,
        });
    });

    it('тело без Content-Length резервирует весь потолок ручки', async () => {
        const boundary = 'chunked-boundary';
        const { body, length } = buildMultipartRequest(boundary);
        const contentType = `multipart/form-data; boundary=${boundary}`;

        // Бюджет с уже занятой частью: одинокий запрос проходит любой, поэтому
        // разницу видно только рядом с другой загрузкой
        const busyBudget = createInflightBodyBudget(length * 3);
        busyBudget.reserve(length);

        const chunked = createFakeEvent([body], { 'content-type': contentType });

        // chunked заявленной длины не имеет, поэтому резервирует худший случай —
        // весь лимит ручки, и в остаток бюджета не влезает
        await expect(readParts(chunked.event, length * 3, busyBudget)).rejects.toMatchObject({
            statusCode: 503,
        });

        // То же тело с честным Content-Length занимает свой размер и проходит
        const declared = createFakeEvent([body], {
            'content-type': contentType,
            'content-length': String(length),
        });

        expect(await readParts(declared.event, length * 3, busyBudget)).toHaveLength(2);
    });
});
