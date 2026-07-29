/**
 * Лимитированное чтение ответа data source.
 *
 * Байтовый бюджет применяется к транспортному потоку ДО JSON.parse: крупный
 * ответ обрывается на чтении и не буферизуется целиком (прежний post-parse
 * замер через JSON.stringify держал в памяти и полный распарсенный объект,
 * и его сериализованную копию — memory spike оставался возможным).
 * Content-Length, если сервер его прислал, проверяется до чтения тела.
 */

// #region Types
/** Минимальный контракт ответа для лимитированного чтения (fetch Response). */
export interface IReadableResponse {
    headers: { get(name: string): string | null };
    body: ReadableStream<Uint8Array> | null;
}
// #endregion

/** Ошибка HTTP-статуса ответа data source (4xx/5xx; тело не читается). */
export class DataSourceHttpError extends Error {
    /** HTTP-статус ответа (попадает в redacted prod-лог — toDataSourceLogError). */
    readonly statusCode: number;

    constructor(statusCode: number) {
        super(`Data source request failed with HTTP ${statusCode}`);
        this.name = 'DataSourceHttpError';
        this.statusCode = statusCode;
    }
}

/** Ошибка превышения байтового бюджета ответа data source. */
export class DataSourceResponseTooLargeError extends Error {
    /** Байт получено к моменту обрыва (или заявлено в Content-Length). */
    readonly receivedBytes: number;

    /** Действующий бюджет, байт. */
    readonly maxResponseBytes: number;

    constructor(receivedBytes: number, maxResponseBytes: number) {
        super(
            `Data source response exceeds byte budget: ${receivedBytes} > ${maxResponseBytes} bytes`
        );
        this.name = 'DataSourceResponseTooLargeError';
        this.receivedBytes = receivedBytes;
        this.maxResponseBytes = maxResponseBytes;
    }
}

/**
 * Reviver JSON.parse, отбрасывающий prototype-pollution ключи (та же защита,
 * что у destr, которую ofetch давал из коробки): `__proto__` и `constructor`
 * со свойством `prototype` не попадают в распарсенный объект — иначе они
 * доехали бы до `source.map`/props, где обычный merge уже создаёт pollution.
 * JSON.parse декодирует Unicode-escape ключей ДО вызова reviver'а, поэтому
 * `"__proto__"` отбрасывается так же.
 *
 * @param key - Ключ текущего свойства.
 * @param value - Значение текущего свойства.
 */
function jsonPollutionSafeReviver(key: string, value: unknown): unknown {
    if (
        key === '__proto__' ||
        (key === 'constructor' &&
            value !== null &&
            typeof value === 'object' &&
            'prototype' in value)
    ) {
        return undefined;
    }

    return value;
}

/**
 * Разбирает текст тела по паттерну ofetch/destr: валидный JSON — значением
 * (без prototype-pollution ключей), прочее — исходной строкой; пустое
 * тело — undefined.
 *
 * @param text - Декодированный текст тела ответа.
 */
function parseResponseText(text: string): unknown {
    if (text.trim() === '') {
        return undefined;
    }

    try {
        return JSON.parse(text, jsonPollutionSafeReviver);
    } catch {
        return text;
    }
}

/**
 * Читает тело ответа потоково с обрывом при превышении бюджета и разбирает
 * результат как JSON (не-JSON текст возвращается строкой).
 *
 * @param response - Ответ fetch/ofetch с непрочитанным телом (responseType 'stream').
 * @param maxResponseBytes - Байтовый бюджет одного ответа data source.
 * @returns Распарсенное значение тела; undefined для пустого тела (HEAD/204).
 * @throws DataSourceResponseTooLargeError при превышении бюджета.
 */
export async function readResponseWithinByteBudget(
    response: IReadableResponse,
    maxResponseBytes: number
): Promise<unknown> {
    // Ответ без тела (HEAD/204) проходит без бюджета: Content-Length у HEAD
    // описывает НЕпереданное тело и не должен давать ложный отказ
    if (!response.body) {
        return undefined;
    }

    const declaredLength = Number(response.headers.get('content-length'));

    if (Number.isFinite(declaredLength) && declaredLength > maxResponseBytes) {
        await response.body.cancel();
        throw new DataSourceResponseTooLargeError(declaredLength, maxResponseBytes);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let receivedBytes = 0;
    let text = '';

    for (;;) {
        const { done, value } = await reader.read();

        if (done) {
            break;
        }

        receivedBytes += value.byteLength;

        if (receivedBytes > maxResponseBytes) {
            await reader.cancel();
            throw new DataSourceResponseTooLargeError(receivedBytes, maxResponseBytes);
        }

        text += decoder.decode(value, { stream: true });
    }

    text += decoder.decode();

    return parseResponseText(text);
}
