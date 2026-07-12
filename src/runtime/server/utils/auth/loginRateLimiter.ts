/**
 * In-memory rate limiter логина database-auth и невалидных Basic-креденшелов.
 *
 * Двухуровневая схема (аудит A-04):
 * - Уровень 1 — ключ `${ip}|${username.toLowerCase()}`: 5 неудач за 15 минут →
 *   lockout на 15 минут (перебор пароля для одного username).
 * - Уровень 2 — ключ `ip:${ip}` (buildIpRateLimitKey): 30 неудач за то же окно →
 *   lockout на 15 минут (перебор со сменой username с одного IP). Проверяется
 *   ДО дорогой scrypt-верификации пароля.
 *
 * Оба уровня используют общее хранилище и общий алгоритм sweep/lockout — без
 * таймеров (дружелюбно к HMR/serverless), просроченные записи убираются
 * opportunistic-sweep'ом при обращениях; жёсткая граница 10k записей защищает
 * память от распылённых атак.
 *
 * Нюанс (документирован): состояние per-process — multi-replica деплой
 * ослабляет лимит пропорционально числу реплик.
 */

/** Максимум неудачных попыток по одному ключу ip|username в окне до блокировки. */
const MAX_FAILURES = 5;
/** Максимум неудач по одному IP (сменяемые username) в окне до блокировки. */
const MAX_IP_FAILURES = 30;
/** Окно подсчёта неудач, мс (15 минут). */
const FAILURE_WINDOW_MS = 15 * 60 * 1000;
/** Длительность блокировки, мс (15 минут). */
const LOCKOUT_MS = 15 * 60 * 1000;
/** Жёсткая граница размера Map. */
const MAX_ENTRIES = 10000;

/** Состояние попыток по одному ключу ip|username. */
interface IRateLimitEntry {
    failures: number;
    windowStartedAt: number;
    lockedUntil: number;
}

const entries = new Map<string, IRateLimitEntry>();

/**
 * Строит ключ лимитера из IP и username (case-insensitive по username).
 */
export function buildRateLimitKey(ip: string, username: string): string {
    return `${ip}|${username.toLowerCase()}`;
}

/**
 * Строит ключ IP-bucket'а (второй уровень: неудачи с любыми username).
 */
export function buildIpRateLimitKey(ip: string): string {
    return `ip:${ip}`;
}

/**
 * Запись «мертва» — окно неудач истекло и блокировки нет.
 */
function isExpired(entry: IRateLimitEntry, now: number): boolean {
    return entry.lockedUntil <= now && now - entry.windowStartedAt > FAILURE_WINDOW_MS;
}

/**
 * Opportunistic sweep: удаляет просроченные записи; при переполнении сверх
 * MAX_ENTRIES удаляет самые старые (Map хранит порядок вставки).
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
 * Возвращает остаток блокировки в секундах (0 — не заблокирован).
 * Значение подходит для заголовка Retry-After.
 *
 * @param key - Ключ из buildRateLimitKey.
 * @returns Секунды до снятия блокировки.
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
 * Регистрирует неудачную попытку логина; на maxFailures-й — включает lockout.
 *
 * @param key - Ключ из buildRateLimitKey (или buildIpRateLimitKey).
 * @param maxFailures - Порог неудач до блокировки (дефолт — MAX_FAILURES).
 */
export function registerFailure(key: string, maxFailures: number = MAX_FAILURES): void {
    const now = Date.now();
    sweep(now);

    const entry = entries.get(key);

    if (!entry || isExpired(entry, now) || now - entry.windowStartedAt > FAILURE_WINDOW_MS) {
        entries.set(key, { failures: 1, windowStartedAt: now, lockedUntil: 0 });
        return;
    }

    // Re-insert для актуализации порядка вставки (старые — первые на выселение)
    entries.delete(key);
    entry.failures += 1;

    if (entry.failures >= maxFailures) {
        entry.lockedUntil = now + LOCKOUT_MS;
    }

    entries.set(key, entry);
}

/**
 * Регистрирует неудачную попытку на IP-bucket (порог MAX_IP_FAILURES) —
 * второй уровень против перебора username (аудит A-04).
 */
export function registerIpFailure(ip: string): void {
    registerFailure(buildIpRateLimitKey(ip), MAX_IP_FAILURES);
}

/**
 * Остаток IP-lockout'а в секундах (0 — не заблокирован).
 */
export function isIpLockedOut(ip: string): number {
    return isLockedOut(buildIpRateLimitKey(ip));
}

/**
 * Сбрасывает счётчик после успешного логина.
 *
 * @param key - Ключ из buildRateLimitKey.
 */
export function resetFailures(key: string): void {
    entries.delete(key);
}

/**
 * Полный сброс состояния (только для тестов).
 */
export function resetRateLimiterState(): void {
    entries.clear();
}
