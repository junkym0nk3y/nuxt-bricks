/**
 * Лимитированное чтение тела запроса (ingress-контроль).
 *
 * Дефолтные читатели h3 (readBody/readMultipartFormData) буферизуют тело
 * целиком до любых проверок размера. Здесь два независимых барьера:
 * заявленный Content-Length проверяется до чтения (413 бесплатно), а стрим
 * читается с жёстким лимитом и обрывается сразу при превышении — заголовок
 * может отсутствовать или врать при chunked transfer.
 */
import { createError, getHeader, type H3Event } from 'h3';
import type { IUploadedFilePart } from '../../types/media';

/**
 * Запас на конверт multipart-формы (границы, заголовки частей, текстовые поля)
 * сверх лимита полезной нагрузки файла.
 */
export const MULTIPART_ENVELOPE_ALLOWANCE_BYTES = 1024 * 1024;

/**
 * Человекочитаемый размер для сообщений об ошибке лимита.
 *
 * @param bytes - Размер в байтах.
 * @returns Строка вида «25MB» или «16KB».
 */
function formatByteSize(bytes: number): string {
    if (bytes >= 1024 * 1024) {
        return `${Math.floor(bytes / (1024 * 1024))}MB`;
    }

    return `${Math.ceil(bytes / 1024)}KB`;
}

/**
 * Ошибка 413 для превышения лимита тела запроса.
 *
 * @param maxBytes - Лимит, использованный при чтении.
 * @returns h3-ошибка со статусом 413.
 */
function payloadTooLarge(maxBytes: number): Error {
    return createError({
        statusCode: 413,
        statusMessage: `Request body exceeds ${formatByteSize(maxBytes)} limit`,
    });
}

/**
 * Читает async-итерируемый источник чанков с жёстким лимитом: обрывает
 * чтение сразу при превышении, не буферизуя остаток.
 *
 * @param source - Источник чанков (Node request, генератор).
 * @param maxBytes - Максимальный суммарный размер.
 * @param buildLimitError - Фабрика ошибки превышения.
 * @returns Буфер с прочитанным содержимым.
 */
export async function collectStreamWithLimit(
    source: AsyncIterable<Uint8Array>,
    maxBytes: number,
    buildLimitError: () => Error
): Promise<Buffer<ArrayBuffer>> {
    const chunks: Uint8Array[] = [];
    let total = 0;

    for await (const chunk of source) {
        total += chunk.byteLength;

        if (total > maxBytes) {
            throw buildLimitError();
        }

        chunks.push(chunk);
    }

    return Buffer.concat(chunks);
}

/**
 * Адаптер web ReadableStream → AsyncIterable с отменой стрима при раннем
 * обрыве чтения (превышение лимита отменяет и сетевую загрузку).
 *
 * @param stream - Web-стрим (тело fetch-ответа).
 */
async function* iterateWebStream(stream: ReadableStream<Uint8Array>): AsyncGenerator<Uint8Array> {
    const reader = stream.getReader();
    let finished = false;

    try {
        for (;;) {
            const { done, value } = await reader.read();

            if (done) {
                finished = true;
                return;
            }

            yield value;
        }
    } finally {
        if (!finished) {
            await reader.cancel().catch(() => undefined);
        }

        reader.releaseLock();
    }
}

/**
 * Читает web ReadableStream (тело fetch-ответа) с жёстким лимитом размера.
 *
 * @param stream - Web-стрим.
 * @param maxBytes - Максимальный суммарный размер.
 * @param buildLimitError - Фабрика ошибки превышения.
 * @returns Буфер с прочитанным содержимым.
 */
export async function collectWebStreamWithLimit(
    stream: ReadableStream<Uint8Array>,
    maxBytes: number,
    buildLimitError: () => Error
): Promise<Buffer<ArrayBuffer>> {
    return collectStreamWithLimit(iterateWebStream(stream), maxBytes, buildLimitError);
}

/**
 * Читает сырое тело запроса с лимитом: pre-check заявленного Content-Length
 * (413 до чтения), затем стрим-чтение с тем же лимитом.
 *
 * @param event - Событие запроса.
 * @param maxBytes - Максимальный размер тела.
 * @returns Буфер с телом запроса.
 */
async function readRawBodyWithLimit(
    event: H3Event,
    maxBytes: number
): Promise<Buffer<ArrayBuffer>> {
    const declaredLength = Number(getHeader(event, 'content-length'));

    if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
        throw payloadTooLarge(maxBytes);
    }

    return collectStreamWithLimit(event.node.req, maxBytes, () => payloadTooLarge(maxBytes));
}

/**
 * Читает JSON-тело с лимитом размера. Пустое тело — null (валидацию
 * «тело обязательно» делает вызывающий), невалидный JSON — 400.
 *
 * @param event - Событие запроса.
 * @param maxBytes - Максимальный размер тела.
 * @returns Распарсенное тело или null.
 */
export async function readJsonBodyWithLimit<T>(
    event: H3Event,
    maxBytes: number
): Promise<T | null> {
    const buffer = await readRawBodyWithLimit(event, maxBytes);

    if (buffer.length === 0) {
        return null;
    }

    try {
        return JSON.parse(buffer.toString('utf8')) as T;
    } catch {
        throw createError({
            statusCode: 400,
            statusMessage: 'Invalid JSON body',
        });
    }
}

/**
 * Парсит multipart/form-data из буфера через стандартный парсер undici
 * (Response.formData). Файловые части — с filename/type, текстовые — только data.
 *
 * @param buffer - Сырое тело запроса.
 * @param contentType - Заголовок Content-Type с boundary.
 * @returns Части формы.
 */
export async function parseMultipartBuffer(
    buffer: Uint8Array<ArrayBuffer>,
    contentType: string
): Promise<IUploadedFilePart[]> {
    let formData: FormData;

    try {
        formData = await new Response(buffer, {
            headers: { 'content-type': contentType },
        }).formData();
    } catch {
        throw createError({
            statusCode: 400,
            statusMessage: 'Malformed multipart/form-data body',
        });
    }

    const parts: IUploadedFilePart[] = [];

    for (const [name, value] of formData.entries()) {
        if (typeof value === 'string') {
            parts.push({ name, data: Buffer.from(value) });
            continue;
        }

        parts.push({
            name,
            filename: value.name,
            type: value.type || undefined,
            data: Buffer.from(await value.arrayBuffer()),
        });
    }

    return parts;
}

/**
 * Читает multipart-форму с лимитом суммарного размера тела
 * (лимит полезной нагрузки + MULTIPART_ENVELOPE_ALLOWANCE_BYTES — на вызывающем).
 *
 * @param event - Событие запроса.
 * @param maxBytes - Максимальный размер тела формы.
 * @returns Части формы.
 */
export async function readMultipartFormDataWithLimit(
    event: H3Event,
    maxBytes: number
): Promise<IUploadedFilePart[]> {
    const contentType = getHeader(event, 'content-type') ?? '';

    if (!contentType.toLowerCase().startsWith('multipart/form-data')) {
        throw createError({
            statusCode: 400,
            statusMessage: 'Expected multipart/form-data request',
        });
    }

    const buffer = await readRawBodyWithLimit(event, maxBytes);

    if (buffer.length === 0) {
        return [];
    }

    return parseMultipartBuffer(buffer, contentType);
}
