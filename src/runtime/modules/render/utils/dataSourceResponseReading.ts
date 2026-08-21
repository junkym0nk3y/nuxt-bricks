/**
 * Bounded reading of a data source response.
 *
 * The byte budget is applied to the transport stream BEFORE JSON.parse: a large
 * response is cut off while being read and never buffered in full (the former
 * post-parse measurement through JSON.stringify kept both the fully parsed
 * object and its serialized copy in memory — a memory spike stayed possible).
 * Content-Length, if the server sent it, is checked before the body is read.
 */

// #region Types
/** Minimal response contract for bounded reading (fetch Response). */
export interface IReadableResponse {
    headers: { get(name: string): string | null };
    body: ReadableStream<Uint8Array> | null;
}
// #endregion

/** HTTP status error of a data source response (4xx/5xx; the body is not read). */
export class DataSourceHttpError extends Error {
    /** Response HTTP status (reaches the redacted prod log — toDataSourceLogError). */
    readonly statusCode: number;

    constructor(statusCode: number) {
        super(`Data source request failed with HTTP ${statusCode}`);
        this.name = 'DataSourceHttpError';
        this.statusCode = statusCode;
    }
}

/** Error of exceeding the byte budget of a data source response. */
export class DataSourceResponseTooLargeError extends Error {
    /** Bytes received by the moment of the cut-off (or declared in Content-Length). */
    readonly receivedBytes: number;

    /** The budget in force, bytes. */
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
 * A JSON.parse reviver that drops prototype-pollution keys (the same protection
 * destr has, the one ofetch used to give out of the box): `__proto__` and a
 * `constructor` with a `prototype` property never reach the parsed object.
 *
 * The renderer's own path pollutes nothing today: the props are merged with
 * object spread, which creates an own `__proto__` key instead of changing the
 * prototype, and `toSafeRecord` strips that key before the merge even happens.
 * What the reviver still guards is the one merge outside our control — the `map`
 * of a data source is consumer code out of a brick file, and an `Object.assign`
 * or a deep merge there over the raw response is the classic way in.
 *
 * JSON.parse decodes Unicode escapes in keys BEFORE calling the reviver, so an
 * escaped `"__proto__"` is dropped just the same.
 *
 * @param key - Key of the current property.
 * @param value - Value of the current property.
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
 * Parses the body text after the ofetch/destr pattern: valid JSON as a value
 * (without prototype-pollution keys), anything else as the original string; an
 * empty body as undefined.
 *
 * @param text - Decoded text of the response body.
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
 * Reads the response body as a stream, cutting it off once the budget is
 * exceeded, and parses the result as JSON (non-JSON text comes back as a string).
 *
 * @param response - fetch/ofetch response with an unread body (responseType 'stream').
 * @param maxResponseBytes - Byte budget of one data source response.
 * @returns The parsed body value; undefined for an empty body (HEAD/204).
 * @throws DataSourceResponseTooLargeError once the budget is exceeded.
 */
export async function readResponseWithinByteBudget(
    response: IReadableResponse,
    maxResponseBytes: number
): Promise<unknown> {
    // A response without a body (HEAD/204) passes without the budget: on HEAD
    // Content-Length describes the body that was NOT sent and must not produce a
    // false refusal
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
