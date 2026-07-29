// #region Imports
// Vitest
import { describe, expect, it } from 'vitest';

// Utils
import {
    DataSourceResponseTooLargeError,
    readResponseWithinByteBudget,
} from '../../src/runtime/modules/render/utils/dataSourceResponseReading';
// #endregion

/**
 * Собирает Response-подобный объект с телом из переданных чанков
 * (Content-Length сознательно не выставляется — путь потокового обрыва).
 */
function makeStreamedResponse(chunks: Uint8Array[], headers: Record<string, string> = {}) {
    let cancelled = false;
    let index = 0;

    const body = new ReadableStream<Uint8Array>({
        pull(controller) {
            if (index < chunks.length) {
                controller.enqueue(chunks[index]);
                index += 1;
                return;
            }
            controller.close();
        },
        cancel() {
            cancelled = true;
        },
    });

    return {
        response: { headers: new Headers(headers), body },
        wasCancelled: () => cancelled,
    };
}

/** Кодирует строку в Uint8Array (UTF-8). */
function encode(text: string): Uint8Array {
    return new TextEncoder().encode(text);
}

describe('readResponseWithinByteBudget (лимит до JSON.parse)', () => {
    it('JSON в пределах бюджета разбирается в значение', async () => {
        const { response } = makeStreamedResponse([encode('{"items":'), encode('[1,2,3]}')]);

        await expect(readResponseWithinByteBudget(response, 1024)).resolves.toEqual({
            items: [1, 2, 3],
        });
    });

    it('не-JSON текст возвращается строкой (паттерн ofetch/destr)', async () => {
        const { response } = makeStreamedResponse([encode('plain text')]);

        await expect(readResponseWithinByteBudget(response, 1024)).resolves.toBe('plain text');
    });

    it('пустое тело и отсутствие тела (HEAD/204) — undefined', async () => {
        const { response } = makeStreamedResponse([]);
        await expect(readResponseWithinByteBudget(response, 1024)).resolves.toBeUndefined();

        await expect(
            readResponseWithinByteBudget({ headers: new Headers(), body: null }, 1024)
        ).resolves.toBeUndefined();
    });

    it('HEAD с Content-Length больше бюджета, но без тела — не ложный отказ', async () => {
        // Content-Length у HEAD описывает НЕпереданное тело GET-ответа
        await expect(
            readResponseWithinByteBudget(
                { headers: new Headers({ 'content-length': '99999' }), body: null },
                10
            )
        ).resolves.toBeUndefined();
    });

    it('Content-Length больше бюджета — отказ ДО чтения тела, поток отменяется', async () => {
        const { response, wasCancelled } = makeStreamedResponse([encode('x'.repeat(100))], {
            'content-length': '100',
        });

        await expect(readResponseWithinByteBudget(response, 10)).rejects.toBeInstanceOf(
            DataSourceResponseTooLargeError
        );
        expect(wasCancelled()).toBe(true);
    });

    it('поток без Content-Length обрывается на превышении бюджета (cancel, не дочитывание)', async () => {
        const { response, wasCancelled } = makeStreamedResponse([
            encode('a'.repeat(8)),
            encode('b'.repeat(8)),
            encode('c'.repeat(8)),
        ]);

        const promise = readResponseWithinByteBudget(response, 10);

        await expect(promise).rejects.toMatchObject({
            name: 'DataSourceResponseTooLargeError',
            receivedBytes: 16,
            maxResponseBytes: 10,
        });
        expect(wasCancelled()).toBe(true);
    });

    it('prototype-pollution ключи отбрасываются (паттерн destr)', async () => {
        const { response } = makeStreamedResponse([
            encode(
                '{"__proto__":{"polluted":1},"constructor":{"prototype":{"polluted":1}},"ok":1}'
            ),
        ]);

        const parsed = (await readResponseWithinByteBudget(response, 1024)) as Record<
            string,
            unknown
        >;

        expect(Object.keys(parsed)).toEqual(['ok']);
        expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    });

    it('Unicode-escaped __proto__ отбрасывается; безобидный constructor остаётся', async () => {
        // JSON.parse декодирует \u-escape ключей до вызова reviver'а
        const { response } = makeStreamedResponse([
            encode(
                '{"\\u005f\\u005fproto\\u005f\\u005f":{"polluted":1},"constructor":"just-a-string","ok":1}'
            ),
        ]);

        const parsed = (await readResponseWithinByteBudget(response, 1024)) as Record<
            string,
            unknown
        >;

        expect(Object.keys(parsed).sort()).toEqual(['constructor', 'ok']);
        expect(parsed.constructor).toBe('just-a-string');
        expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    });

    it('multibyte-символ на границе чанков декодируется корректно', async () => {
        const bytes = encode('{"text":"привет"}');
        // Рвём буфер посреди двухбайтового символа
        const { response } = makeStreamedResponse([bytes.slice(0, 12), bytes.slice(12)]);

        await expect(readResponseWithinByteBudget(response, 1024)).resolves.toEqual({
            text: 'привет',
        });
    });
});
