/**
 * Комбинирование AbortSignal'ов (чистая изоморфная утилита).
 *
 * Нужна data sources published-страницы (аудит A-09): на один запрос действуют
 * два независимых потолка — per-request таймаут и общий wall-clock дедлайн
 * прогона. ofetch строит внутренний timeout-abort только когда caller-signal
 * НЕ передан, поэтому при общем дедлайне per-request таймаут обеспечивается
 * явной комбинацией сигналов.
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
