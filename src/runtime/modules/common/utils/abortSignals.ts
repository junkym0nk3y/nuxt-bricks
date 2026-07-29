/**
 * Комбинирование AbortSignal'ов (чистая изоморфная утилита).
 *
 * Нужна двум доменам, и по одной причине: ofetch строит внутренний timeout-abort
 * только когда caller-signal НЕ передан, поэтому при чужом сигнале потолок
 * обеспечивается явной комбинацией. У data sources published-страницы это
 * per-request таймаут против общего wall-clock дедлайна прогона, у
 * клиента билдера — дефолтный потолок против сигнала вызывающего.
 * Поэтому утилита живёт в `common`: `common` — нижний слой, из `render` в него
 * импортировать можно, обратно нельзя.
 */

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
