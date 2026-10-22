/**
 * In-memory fixed-window rate limiter for the ingest handlers (media upload,
 * preview snapshots). The key is the request IP.
 *
 * With no timers (friendly to HMR and serverless) — expired windows are dropped
 * by an opportunistic sweep on access; the hard maxEntries limit protects memory
 * from attacks spread across keys.
 *
 * A caveat (the same as loginRateLimiter): the state is per process — a
 * multi-replica deployment weakens the limit proportionally to the number of
 * replicas.
 */
import { createError, setResponseHeader, type H3Event } from 'h3';
import { resolveRequestClientIp } from './requestClientIp';

/** Default hard limit on the size of the Map */
const DEFAULT_MAX_ENTRIES = 10_000;

/** Window state for one key */
interface IWindowEntry {
    count: number;
    windowStartedAt: number;
}

/** Limiter parameters */
export interface IFixedWindowLimiterOptions {
    /** Maximum requests within the window */
    limit: number;
    /** Window duration, ms */
    windowMs: number;
    /** Hard limit on the number of tracked keys */
    maxEntries?: number;
}

/** Fixed-window limiter: hit returns seconds until the window ends (0 — allowed) */
export interface IFixedWindowLimiter {
    hit(key: string): number;
    reset(): void;
}

/**
 * Creates a fixed-window rate limiter.
 *
 * @param options - Limit, window and memory bound.
 * @returns The limiter.
 */
export function createFixedWindowRateLimiter(
    options: IFixedWindowLimiterOptions
): IFixedWindowLimiter {
    const { limit, windowMs } = options;
    const maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES;
    const entries = new Map<string, IWindowEntry>();

    /**
     * The window of the entry has expired.
     */
    function isExpired(entry: IWindowEntry, now: number): boolean {
        return now - entry.windowStartedAt >= windowMs;
    }

    /**
     * Opportunistic sweep: removes expired windows; on overflow past maxEntries
     * it removes the oldest ones (a Map keeps insertion order).
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
         * Registers a request under the key.
         *
         * @param key - Client key (IP).
         * @returns 0 — allowed; otherwise seconds until the window ends
         * (for Retry-After).
         */
        hit(key: string): number {
            const now = Date.now();
            sweep(now);

            const entry = entries.get(key);

            if (!entry || isExpired(entry, now)) {
                entries.set(key, { count: 1, windowStartedAt: now });
                return 0;
            }

            // Re-insert to refresh the insertion order (the oldest are evicted first)
            entries.delete(key);
            entry.count += 1;
            entries.set(key, entry);

            if (entry.count <= limit) {
                return 0;
            }

            return Math.max(1, Math.ceil((entry.windowStartedAt + windowMs - now) / 1000));
        },

        /**
         * Full state reset (tests only).
         */
        reset(): void {
            entries.clear();
        },
    };
}

/**
 * Checks the rate limit of a request by IP; on excess, 429 with Retry-After.
 *
 * @param event - Request event.
 * @param limiter - Limiter of the handler.
 * @param message - Message of the 429 response.
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
