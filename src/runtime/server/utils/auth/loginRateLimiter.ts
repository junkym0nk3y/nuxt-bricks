/**
 * In-memory rate limiter for the database-auth login and for invalid Basic
 * credentials.
 *
 * A two-level scheme:
 * - Level 1 — key `${ip}|${username.toLowerCase()}`: 5 failures in 15 minutes →
 *   a 15-minute lockout (password brute force against a single username).
 * - Level 2 — key `ip:${ip}` (buildIpRateLimitKey): 30 failures in the same
 *   window → a 15-minute lockout (brute force from one IP with a changing
 *   username). Checked BEFORE the expensive scrypt password verification.
 *
 * Both levels share one store and one sweep/lockout algorithm — with no timers
 * (friendly to HMR and serverless), expired entries are dropped by an
 * opportunistic sweep on access; the hard limit of 10k entries protects memory
 * from spread-out attacks.
 *
 * A documented caveat: the state is per process — a multi-replica deployment
 * weakens the limit proportionally to the number of replicas.
 */

/** Maximum failed attempts per one ip|username key within the window before lockout */
const MAX_FAILURES = 5;
/**
 * Maximum failures per one IP (with changing usernames) within the window before
 * lockout.
 */
const MAX_IP_FAILURES = 30;
/** Failure counting window, ms (15 minutes) */
const FAILURE_WINDOW_MS = 15 * 60 * 1000;
/** Lockout duration, ms (15 minutes) */
const LOCKOUT_MS = 15 * 60 * 1000;
/** Hard limit on the size of the Map */
const MAX_ENTRIES = 10000;

/** Attempt state for one ip|username key */
interface IRateLimitEntry {
    failures: number;
    windowStartedAt: number;
    lockedUntil: number;
}

const entries = new Map<string, IRateLimitEntry>();

/**
 * Builds the limiter key from an IP and a username (case-insensitive on the username).
 */
export function buildRateLimitKey(ip: string, username: string): string {
    return `${ip}|${username.toLowerCase()}`;
}

/**
 * Builds the IP bucket key (level two: failures with any username).
 */
export function buildIpRateLimitKey(ip: string): string {
    return `ip:${ip}`;
}

/**
 * The entry is dead — the failure window has expired and there is no lockout.
 */
function isExpired(entry: IRateLimitEntry, now: number): boolean {
    return entry.lockedUntil <= now && now - entry.windowStartedAt > FAILURE_WINDOW_MS;
}

/**
 * Opportunistic sweep: removes expired entries; on overflow past MAX_ENTRIES it
 * removes the oldest ones (a Map keeps insertion order).
 */
function sweep(now: number): void {
    for (const [key, entry] of entries) {
        if (isExpired(entry, now)) {
            entries.delete(key);
        }
    }

    if (entries.size >= MAX_ENTRIES) {
        const excess = entries.size - MAX_ENTRIES + 1;
        let removed = 0;

        for (const key of entries.keys()) {
            entries.delete(key);
            removed += 1;

            if (removed >= excess) {
                break;
            }
        }
    }
}

/**
 * Returns the remaining lockout in seconds (0 — not locked out).
 * The value fits the Retry-After header.
 *
 * @param key - Key from buildRateLimitKey.
 * @returns Seconds until the lockout is lifted.
 */
export function isLockedOut(key: string): number {
    const now = Date.now();
    const entry = entries.get(key);

    if (!entry) {
        return 0;
    }

    if (entry.lockedUntil > now) {
        return Math.ceil((entry.lockedUntil - now) / 1000);
    }

    if (isExpired(entry, now)) {
        entries.delete(key);
    }

    return 0;
}

/**
 * Registers a failed login attempt; on the maxFailures-th one it turns on the lockout.
 *
 * @param key - Key from buildRateLimitKey (or buildIpRateLimitKey).
 * @param maxFailures - Failure threshold before lockout (defaults to MAX_FAILURES).
 */
export function registerFailure(key: string, maxFailures: number = MAX_FAILURES): void {
    const now = Date.now();
    sweep(now);

    const entry = entries.get(key);

    if (!entry || isExpired(entry, now) || now - entry.windowStartedAt > FAILURE_WINDOW_MS) {
        entries.set(key, { failures: 1, windowStartedAt: now, lockedUntil: 0 });
        return;
    }

    // Re-insert to refresh the insertion order (the oldest are evicted first)
    entries.delete(key);
    entry.failures += 1;

    if (entry.failures >= maxFailures) {
        entry.lockedUntil = now + LOCKOUT_MS;
    }

    entries.set(key, entry);
}

/**
 * Registers a failed attempt on the IP bucket (threshold MAX_IP_FAILURES) —
 * level two against username brute force.
 */
export function registerIpFailure(ip: string): void {
    registerFailure(buildIpRateLimitKey(ip), MAX_IP_FAILURES);
}

/**
 * Remaining IP lockout in seconds (0 — not locked out).
 */
export function isIpLockedOut(ip: string): number {
    return isLockedOut(buildIpRateLimitKey(ip));
}

/**
 * Resets the counter after a successful login.
 *
 * @param key - Key from buildRateLimitKey.
 */
export function resetFailures(key: string): void {
    entries.delete(key);
}

/**
 * Full state reset (tests only).
 */
export function resetRateLimiterState(): void {
    entries.clear();
}
