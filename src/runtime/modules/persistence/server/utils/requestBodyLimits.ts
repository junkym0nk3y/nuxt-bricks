/**
 * Лимитированное чтение тела запроса (ingress-контроль).
 *
 * Дефолтные читатели h3 (readBody/readMultipartFormData) буферизуют тело
 * целиком до любых проверок размера. Здесь три независимых барьера:
 * заявленный Content-Length проверяется до чтения (413 бесплатно), стрим
 * читается с жёстким лимитом и обрывается сразу при превышении (заголовок
 * может отсутствовать или врать при chunked transfer), а суммарный объём
 * ОДНОВРЕМЕННО буферизуемых форм ограничен бюджетом.
 */
import { createError, getHeader, type H3Event } from 'h3';
import type { IUploadedFilePart } from '../../types/media';
import type { IBodyReservation, IInflightBodyBudget } from '../../types/requestBodyLimits';

/**
 * Запас на конверт multipart-формы (границы, заголовки частей, текстовые поля)
 * сверх лимита полезной нагрузки файла.
 */
export const MULTIPART_ENVELOPE_ALLOWANCE_BYTES = 1024 * 1024;

/**
 * Потолок суммарного объёма multipart-форм, которые сервер согласен держать в
 * памяти одновременно.
 *
 * Rate limit ручек считает запросы, а не их одновременность: разрешённые
 * тридцать загрузок в минуту могут прийти все сразу, и тело каждой собирается в
 * память целиком. 256 МБ пропускают две загрузки видео максимального размера
 * или сотни картинок; дальше запрос отклоняется сразу, не начав читать тело.
 *
 * Бюджет считает ЗАЯВЛЕННЫЙ объём тела, а не пик памяти: разбор формы копирует
 * тело ещё раз, поэтому фактический пик — до двух бюджетов. Учитывать копию в
 * самом резерве значило бы вдвое урезать пропускную способность ради того же
 * порядка величины.
 */
const INFLIGHT_MULTIPART_BUDGET_BYTES = 256 * 1024 * 1024;

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
 * Ошибка 503 для переполнения бюджета одновременного буферизования.
 *
 * Не 429: лимит клиента не исчерпан, занят сервер, и повторить стоит тем же
 * запросом чуть позже.
 *
 * @returns h3-ошибка со статусом 503.
 */
function tooManyInflightBodies(): Error {
    return createError({
        statusCode: 503,
        statusMessage: 'Server is busy receiving uploads, try again later',
    });
}

/**
 * Создаёт бюджет одновременного буферизования тел.
 *
 * @param maxBytes - Суммарный потолок.
 * @returns Бюджет.
 */
export function createInflightBodyBudget(maxBytes: number): IInflightBodyBudget {
    let usedBytes = 0;

    return {
        reserve(bytes: number): () => void {
            // Одинокий запрос проходит всегда, даже когда он один больше
            // бюджета: иначе конфигурация с потолком файла выше бюджета
            // отклоняла бы каждую загрузку, то есть ручка не работала бы вовсе
            if (usedBytes > 0 && usedBytes + bytes > maxBytes) {
                throw tooManyInflightBodies();
            }

            usedBytes += bytes;
            let released = false;

            return () => {
                // Идемпотентно: повторное освобождение вернуло бы в бюджет
                // байты, которых там нет, и потолок уехал бы вверх навсегда
                if (released) {
                    return;
                }

                released = true;
                usedBytes -= bytes;
            };
        },
    };
}

/** Общий бюджет всех multipart-ручек: память у них одна. */
const inflightMultipartBudget = createInflightBodyBudget(INFLIGHT_MULTIPART_BUDGET_BYTES);

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
 * Проверяет заявленный Content-Length и резервирует под тело место в бюджете.
 *
 * Резерв идёт по заявленной длине, а чтение — по резерву: клиент, заявивший
 * один байт и присылающий сто мегабайт chunked'ом, иначе обходил бы бюджет —
 * читать мы согласились бы до общего потолка ручки, зарезервировав байт.
 * Заголовка нет вовсе — резервируется весь потолок, то есть худший случай.
 *
 * @param event - Событие запроса.
 * @param maxBytes - Максимальный размер тела.
 * @param budget - Бюджет одновременного буферизования; без него резерв не ведётся.
 * @returns Потолок чтения и освобождение резерва.
 */
function reserveRequestBody(
    event: H3Event,
    maxBytes: number,
    budget?: IInflightBodyBudget
): IBodyReservation {
    const declaredLength = Number(getHeader(event, 'content-length'));
    const hasDeclaredLength = Number.isFinite(declaredLength) && declaredLength >= 0;

    if (hasDeclaredLength && declaredLength > maxBytes) {
        throw payloadTooLarge(maxBytes);
    }

    if (!budget) {
        return { limitBytes: maxBytes, release: (): void => undefined };
    }

    const reservedBytes = hasDeclaredLength ? declaredLength : maxBytes;

    return { limitBytes: reservedBytes, release: budget.reserve(reservedBytes) };
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
    const { limitBytes } = reserveRequestBody(event, maxBytes);

    return collectStreamWithLimit(event.node.req, limitBytes, () => payloadTooLarge(maxBytes));
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
 * (лимит полезной нагрузки + MULTIPART_ENVELOPE_ALLOWANCE_BYTES — на вызывающем)
 * и отдаёт её обработчику, ДЕРЖА место в бюджете одновременного буферизования до
 * конца обработки.
 *
 * Форма отдаётся колбэку, а не возвращается, именно из-за бюджета. Буферы частей
 * живут ровно столько, сколько работает обработчик: файл проходит через sharp и
 * уезжает в хранилище, и всё это время он в памяти. Резерв, снятый сразу после
 * разбора, ограничивал бы только короткую фазу чтения — при медленном хранилище
 * ручка успевала бы «освободить» бюджет под десяток стомегабайтных тел, каждое из
 * которых никуда не делось. Колбэк вместо пары «прочитать / освободить» —
 * чтобы освобождение нельзя было забыть: утёкший резерв навсегда сужает потолок.
 *
 * Тип файла границам тела не подчиняется: части формы разбираются только после
 * того, как тело прочитано целиком, поэтому лимит ЧТЕНИЯ у ручки один — по
 * самому большому допустимому файлу. Свой потолок каждого типа проверяют
 * validate*-хелперы уже по разобранной форме.
 *
 * @param event - Событие запроса.
 * @param maxBytes - Максимальный размер тела формы.
 * @param use - Обработчик разобранной формы; его результат возвращается наружу.
 * @param budget - Бюджет одновременного буферизования; по умолчанию общий.
 * @returns Результат обработчика.
 */
export async function withMultipartFormData<T>(
    event: H3Event,
    maxBytes: number,
    use: (parts: IUploadedFilePart[]) => Promise<T>,
    budget: IInflightBodyBudget = inflightMultipartBudget
): Promise<T> {
    const contentType = getHeader(event, 'content-type') ?? '';

    if (!contentType.toLowerCase().startsWith('multipart/form-data')) {
        throw createError({
            statusCode: 400,
            statusMessage: 'Expected multipart/form-data request',
        });
    }

    const reservation = reserveRequestBody(event, maxBytes, budget);

    try {
        const buffer = await collectStreamWithLimit(event.node.req, reservation.limitBytes, () =>
            payloadTooLarge(maxBytes)
        );

        if (buffer.length === 0) {
            return await use([]);
        }

        return await use(await parseMultipartBuffer(buffer, contentType));
    } finally {
        reservation.release();
    }
}
