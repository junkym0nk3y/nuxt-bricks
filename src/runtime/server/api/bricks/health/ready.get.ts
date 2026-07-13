import { createError, defineEventHandler, setResponseHeader } from 'h3';
import { useRuntimeConfig } from 'nitropack/runtime';
import {
    hasCustomBricksStorageAdapter,
    useBricksStorageAdapter,
} from '../../../../modules/persistence/server/registry';
import { getBricksDefaultStorageFactory } from '../../../../modules/persistence/server/defaultStorage';
import { resolveReadinessTarget } from '../../../utils/readinessTarget';

/** Зависший коннект/дальний backend не должны вешать probe дольше таймаута. */
const READINESS_TIMEOUT_MS = 5000;

/**
 * Оборачивает промис таймаутом: reject по истечении, таймер всегда очищается.
 *
 * @param promise - Проверяемый промис.
 * @param timeoutMs - Таймаут в миллисекундах.
 */
async function withTimeout(promise: Promise<void>, timeoutMs: number): Promise<void> {
    let timer: ReturnType<typeof setTimeout> | undefined;

    const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(
            () => reject(new Error(`Readiness check timed out after ${timeoutMs}ms`)),
            timeoutMs
        );
    });

    try {
        await Promise.race([promise, timeout]);
    } finally {
        clearTimeout(timer);
    }
}

/**
 * GET /api/bricks/health/ready — readiness probe. Подтверждает готовность
 * persistence-адаптера; ни БД, ни external backend, ни кастомного адаптера →
 * 503 (аудит A-05). Наружу деталей не отдаёт — полная ошибка уходит в
 * server-лог.
 */
export default defineEventHandler(async (event) => {
    setResponseHeader(event, 'Cache-Control', 'no-store');

    const config = useRuntimeConfig();
    const target = resolveReadinessTarget({
        hasExternalBackend: Boolean(getBricksDefaultStorageFactory()),
        hasDatabaseUrl: Boolean(config.bricksDatabaseUrl),
        hasCustomAdapter: hasCustomBricksStorageAdapter(),
    });

    try {
        if (target === 'none') {
            throw new Error('No persistence configured (neither database nor adapter)');
        }

        const adapter = useBricksStorageAdapter();

        // Адаптер без checkHealth не считается готовым автоматически:
        // fallback — минимальный реальный editorial-запрос (ре-ревью A-05)
        const probe = adapter.checkHealth
            ? adapter.checkHealth()
            : adapter.listPages().then(() => undefined);

        await withTimeout(probe, READINESS_TIMEOUT_MS);

        return { status: 'ok' };
    } catch (error: unknown) {
        console.error('[Bricks Health] Readiness check failed:', error);

        throw createError({ statusCode: 503, statusMessage: 'Service is not ready' });
    }
});
