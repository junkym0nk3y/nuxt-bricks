import { createError, defineEventHandler, setResponseHeader } from 'h3';
import { useBricksStorageAdapter } from '../../../../modules/persistence/server/registry';

/** Зависший коннект к БД не должен вешать probe дольше этого таймаута. */
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
 * GET /api/bricks/health/ready — readiness probe: приложение готово принимать
 * трафик. Дёргает опциональный `IStorageAdapter.checkHealth` (дефолтный
 * Postgres-адаптер — `SELECT 1`; без сконфигурированной БД проверка
 * пропускается); адаптер без метода считается всегда готовым. Наружу деталей
 * не отдаёт — полная ошибка уходит в server-лог.
 */
export default defineEventHandler(async (event) => {
    setResponseHeader(event, 'Cache-Control', 'no-store');

    try {
        const adapter = useBricksStorageAdapter();

        if (adapter.checkHealth) {
            await withTimeout(adapter.checkHealth(), READINESS_TIMEOUT_MS);
        }

        return { status: 'ok' };
    } catch (error: unknown) {
        console.error('[Bricks Health] Readiness check failed:', error);

        throw createError({ statusCode: 503, statusMessage: 'Service is not ready' });
    }
});
