/**
 * In-memory fixed-window rate limiter для ingest-ручек (загрузка медиа,
 * снапшоты превью). Ключ — IP запроса.
 *
 * Без таймеров (дружелюбно к HMR/serverless) — просроченные окна убираются
 * opportunistic-sweep'ом при обращениях; жёсткая граница maxEntries защищает
 * память от распылённых по ключам атак.
 *
 * Нюанс (как у loginRateLimiter): состояние per-process — multi-replica
 * деплой ослабляет лимит пропорционально числу реплик.
 */
import { createError, setResponseHeader, type H3Event } from 'h3';
import { resolveRequestClientIp } from './requestClientIp';

/** Дефолтная жёсткая граница размера Map. */
const DEFAULT_MAX_ENTRIES = 10_000;

/** Состояние окна по одному ключу. */
interface IWindowEntry {
    count: number;
    windowStartedAt: number;
}

/** Параметры лимитера. */
export interface IFixedWindowLimiterOptions {
    /** Максимум запросов в окне. */
    limit: number;
    /** Длительность окна, мс. */
    windowMs: number;
    /** Жёсткая граница числа отслеживаемых ключей. */
    maxEntries?: number;
}

/** Fixed-window лимитер: hit возвращает секунды до конца окна (0 — разрешено). */
export interface IFixedWindowLimiter {
    hit(key: string): number;
    reset(): void;
}

/**
 * Создаёт fixed-window rate limiter.
 *
 * @param options - Лимит, окно и граница памяти.
 * @returns Лимитер.
 */
export function createFixedWindowRateLimiter(
    options: IFixedWindowLimiterOptions
): IFixedWindowLimiter {
    const { limit, windowMs } = options;
    const maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES;
    const entries = new Map<string, IWindowEntry>();

    /**
     * Окно записи истекло.
     */
    function isExpired(entry: IWindowEntry, now: number): boolean {
        return now - entry.windowStartedAt >= windowMs;
    }

    /**
     * Opportunistic sweep: удаляет истёкшие окна; при переполнении сверх
     * maxEntries удаляет самые старые (Map хранит порядок вставки).
     */
    function sweep(now: number): void {
        for (const [key, entry] of entries) {
            if (isExpired(entry, now)) {
                entries.delete(key);
            }
        }

        if (entries.size < maxEntries) {
            return;
        }

        const excess = entries.size - maxEntries + 1;
        let removed = 0;

        for (const key of entries.keys()) {
            entries.delete(key);
            removed += 1;

            if (removed >= excess) {
                break;
            }
        }
    }

    return {
        /**
         * Регистрирует запрос по ключу.
         *
         * @param key - Ключ клиента (IP).
         * @returns 0 — разрешено; иначе секунды до конца окна (для Retry-After).
         */
        hit(key: string): number {
            const now = Date.now();
            sweep(now);

            const entry = entries.get(key);

            if (!entry || isExpired(entry, now)) {
                entries.set(key, { count: 1, windowStartedAt: now });
                return 0;
            }

            // Re-insert для актуализации порядка вставки (старые — первые на выселение)
            entries.delete(key);
            entry.count += 1;
            entries.set(key, entry);

            if (entry.count <= limit) {
                return 0;
            }

            return Math.max(1, Math.ceil((entry.windowStartedAt + windowMs - now) / 1000));
        },

        /**
         * Полный сброс состояния (только для тестов).
         */
        reset(): void {
            entries.clear();
        },
    };
}

/**
 * Проверяет rate limit запроса по IP; при превышении — 429 с Retry-After.
 *
 * @param event - Событие запроса.
 * @param limiter - Лимитер ручки.
 * @param message - Сообщение 429-ответа.
 */
export function assertWithinRateLimit(
    event: H3Event,
    limiter: IFixedWindowLimiter,
    message: string
): void {
    const retryAfterSeconds = limiter.hit(resolveRequestClientIp(event));

    if (retryAfterSeconds > 0) {
        setResponseHeader(event, 'Retry-After', retryAfterSeconds);
        throw createError({
            statusCode: 429,
            statusMessage: message,
        });
    }
}
