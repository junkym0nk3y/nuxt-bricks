/**
 * Сигналы отмены запросов: собственный потолок ожидания и комбинация сигналов
 * (чистые изоморфные утилиты).
 *
 * Потолок оформляется сигналом, а не опцией `timeout` ofetch, потому что таймер
 * ofetch снимается сразу после получения заголовков (`finally` вокруг одного
 * `await fetch(...)`), а тело читается позже — backend, отдавший статус и
 * зависший посреди JSON, держал бы промис вечно. Живой сигнал обрывает обе фазы:
 * поток тела привязан к нему по спецификации fetch.
 *
 * Комбинация нужна там, где вызывающий передал свой сигнал: ofetch строит
 * внутренний timeout-abort только когда `signal` НЕ передан, поэтому потолок и
 * отмена вызывающего должны быть сведены в один сигнал явно.
 *
 * Утилиты живут в `common` — нижнем слое: их используют и политика запросов
 * билдера, и клиенты публичного рендера.
 */

/**
 * Верхняя граница задержки таймера: `setTimeout` в Node молча обрезает всё
 * больше 2^31−1 до 1 мс, а `AbortSignal.timeout` на таком значении бросает
 * `RangeError` ещё до отправки запроса. Обе платформы приводим к одному краю.
 */
const MAX_TIMER_DELAY_MS = 2_147_483_647;

/**
 * Приводит потолок к задержке, которую примут оба механизма таймера.
 *
 * `AbortSignal.timeout` строже `setTimeout`: нецелое, `Infinity`, отрицательное
 * или большее 2^31−1 значение он отвергает синхронным `RangeError`, то есть
 * запрос падал бы до отправки — и падал бы только там, где нативный API есть.
 * Значения приходят в том числе из пользовательской конфигурации
 * (`bricks.dataSources.timeoutMs`), где никакой валидации нет, поэтому мусор
 * гасится здесь: неинтерпретируемое значение превращается в максимальную
 * задержку — «фактически без потолка» лучше отказа всех запросов подряд.
 *
 * @param timeoutMs - Потолок ожидания в миллисекундах.
 * @returns Целая задержка в допустимом для таймера диапазоне.
 */
function toTimerDelayMs(timeoutMs: number): number {
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
        return MAX_TIMER_DELAY_MS;
    }

    return Math.min(Math.ceil(timeoutMs), MAX_TIMER_DELAY_MS);
}

/**
 * Возвращает сигнал, который абортится по истечении потолка ошибкой с именем
 * `TimeoutError` — тем самым, по которому обрыв распознают вызывающие
 * (`isRequestTimeoutError`).
 *
 * Предпочитает нативный `AbortSignal.timeout` (его таймер event loop Node не
 * держит); fallback на своём контроллере нужен для окружений без этого API —
 * без проверки любой запрос падал бы `TypeError`'ом до отправки. Таймер fallback
 * снимается только срабатыванием: `onRequest`-хук ofetch завершается задолго до
 * ответа, снимать его оттуда нечем. Цена — объект таймера, живущий до конца
 * потолка после уже завершённого запроса; альтернатива (снятие в `onResponse`)
 * оставила бы без потолка чтение тела, ради которого сигнал и ставится.
 *
 * @param timeoutMs - Потолок ожидания в миллисекундах.
 * @returns Сигнал, абортящийся по истечении потолка.
 */
export function createTimeoutSignal(timeoutMs: number): AbortSignal {
    const delayMs = toTimerDelayMs(timeoutMs);

    if (typeof AbortSignal.timeout === 'function') {
        return AbortSignal.timeout(delayMs);
    }

    const controller = new AbortController();
    const timer: ReturnType<typeof setTimeout> = setTimeout(() => {
        const error = new Error('The operation was aborted due to timeout');
        error.name = 'TimeoutError';
        controller.abort(error);
    }, delayMs);

    // В Node незачищенный таймер держал бы процесс живым до конца потолка —
    // SSR-рендер и prerender ждали бы уже отвеченный запрос; в браузере
    // `setTimeout` отдаёт число, и метода на нём нет
    if (typeof timer === 'object' && typeof timer.unref === 'function') {
        timer.unref();
    }

    return controller.signal;
}

/**
 * Возвращает сигнал, который абортится, как только абортится любой из входных.
 * Предпочитает нативный `AbortSignal.any`; fallback — контроллер с once-слушателями
 * на входных сигналах (слушатели снимаются автоматически при аборте комбинированного
 * через опцию `signal` addEventListener).
 *
 * @param signals - Входные сигналы (непустой массив).
 * @returns Комбинированный сигнал (единственный входной возвращается как есть).
 */
export function combineAbortSignals(signals: AbortSignal[]): AbortSignal {
    if (signals.length === 1) {
        return signals[0];
    }

    if (typeof AbortSignal.any === 'function') {
        return AbortSignal.any(signals);
    }

    const controller = new AbortController();

    for (const signal of signals) {
        if (signal.aborted) {
            controller.abort(signal.reason);
            break;
        }

        signal.addEventListener('abort', () => controller.abort(signal.reason), {
            once: true,
            signal: controller.signal,
        });
    }

    return controller.signal;
}
