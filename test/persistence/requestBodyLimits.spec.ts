// #region Imports
// Types
import type { H3Event } from 'h3';

// Node
import { Readable } from 'node:stream';

// Vitest
import { describe, expect, it } from 'vitest';

// Utils
import {
    collectStreamWithLimit,
    collectWebStreamWithLimit,
    readJsonBodyWithLimit,
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
 * Фейковое событие запроса с телом-строкой: заголовки читаются штатным
 * `getHeader` (он смотрит в `event.node.req.headers`).
 */
function createJsonEvent(body: string, headers: Record<string, string> = {}): H3Event {
    const request = Readable.from([Buffer.from(body, 'utf8')]);

    Object.assign(request, { headers });

    return { node: { req: request } } as unknown as H3Event;
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
});

describe('requestBodyLimits: JSON-тело под потолком', () => {
    it('разбирает тело и отдаёт null на пустом', async () => {
        expect(await readJsonBodyWithLimit(createJsonEvent('{"a":1}'), 1024)).toEqual({ a: 1 });
        expect(await readJsonBodyWithLimit(createJsonEvent(''), 1024)).toBeNull();
    });

    it('битый JSON — 400', async () => {
        await expect(
            readJsonBodyWithLimit(createJsonEvent('{not json'), 1024)
        ).rejects.toMatchObject({ statusCode: 400 });
    });

    it('заявленная длина выше потолка — 413 до чтения тела', async () => {
        const event = createJsonEvent('{"a":1}', { 'content-length': '9999' });

        await expect(readJsonBodyWithLimit(event, 1024)).rejects.toMatchObject({ statusCode: 413 });
    });

    it('тело больше потолка — 413 по мере чтения, а не по заголовку', async () => {
        // Заголовка нет вовсе: единственная защита — предел на само чтение
        const event = createJsonEvent('{"a":"' + 'x'.repeat(200) + '"}');

        await expect(readJsonBodyWithLimit(event, 50)).rejects.toMatchObject({ statusCode: 413 });
    });
});
