// #region Imports
// Vitest
import { describe, expect, it } from 'vitest';

// Utils
import {
    collectStreamWithLimit,
    collectWebStreamWithLimit,
    parseMultipartBuffer,
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
