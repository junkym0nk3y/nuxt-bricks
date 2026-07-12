import { createError, defineEventHandler, setResponseHeader } from 'h3';
import { useRuntimeConfig } from 'nitropack/runtime';
import {
    hasCustomBricksStorageAdapter,
    useBricksStorageAdapter,
} from '../../../../modules/persistence/server/registry';
import { getBricksDefaultStorageFactory } from '../../../../modules/persistence/server/defaultStorage';
import {
    isProxyHealthStatusReady,
    isProxyStatusReady,
    resolveReadinessTarget,
} from '../../../utils/readinessTarget';
import { isBricksLegacyBackendMode } from '../../../utils/legacyBackendFlag';

/** Зависший коннект/дальний proxy не должны вешать probe дольше таймаута. */
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
 * Проба downstream-proxy. Со сконфигурированным health-эндпоинтом
 * (`bricks.proxy.healthUrl` / NUXT_BRICKS_PROXY_HEALTH_URL) — GET по нему,
 * готовность только при 2xx. Без него — reachability-fallback: HEAD на
 * PROXY_URL, ответ < 500 (включая 404/405) считается живым backend'ом —
 * осознанное ограничение: неверный путь PROXY_URL или отсутствующий
 * editorial API на живом хосте так не детектируются (ре-ревью A-05).
 * Сетевые ошибки и таймаут — не готов в обоих режимах.
 *
 * @param proxyUrl - PROXY_URL из runtimeConfig.
 * @param healthUrl - Health-эндпоинт backend'а (пустая строка — не задан).
 */
async function probeProxyEndpoint(proxyUrl: string, healthUrl: string): Promise<void> {
    if (healthUrl) {
        const response = await fetch(healthUrl, { method: 'GET', redirect: 'manual' });
        // Тело health-ответа не используется — освобождаем поток
        await response.body?.cancel().catch(() => undefined);

        if (!isProxyHealthStatusReady(response.status)) {
            throw new Error(`Proxy health endpoint returned HTTP ${response.status}`);
        }

        return;
    }

    const response = await fetch(proxyUrl, { method: 'HEAD', redirect: 'manual' });

    if (!isProxyStatusReady(response.status)) {
        throw new Error(`Proxy readiness probe got HTTP ${response.status}`);
    }
}

/**
 * GET /api/bricks/health/ready — readiness probe. Выбирает persistence-путь
 * (адаптер / proxy / ничего) и подтверждает готовность именно его:
 * ни БД, ни proxy, ни кастомного адаптера → 503 (аудит A-05).
 * Наружу деталей не отдаёт — полная ошибка уходит в server-лог.
 */
export default defineEventHandler(async (event) => {
    setResponseHeader(event, 'Cache-Control', 'no-store');

    const config = useRuntimeConfig();
    const proxyUrl =
        (config.bricksSsrProxyUrl as string | undefined) ||
        (config.bricksProxyUrl as string | undefined);
    const target = resolveReadinessTarget({
        hasExternalBackend: Boolean(getBricksDefaultStorageFactory()),
        isLegacyBackendMode: isBricksLegacyBackendMode(),
        hasDatabaseUrl: Boolean(config.bricksDatabaseUrl),
        hasProxyUrl: Boolean(proxyUrl),
        hasCustomAdapter: hasCustomBricksStorageAdapter(),
    });

    try {
        if (target === 'none') {
            throw new Error('No persistence configured (neither database, proxy nor adapter)');
        }

        if (target === 'adapter') {
            const adapter = useBricksStorageAdapter();

            // Адаптер без checkHealth не считается готовым автоматически:
            // fallback — минимальный реальный editorial-запрос (ре-ревью A-05)
            const probe = adapter.checkHealth
                ? adapter.checkHealth()
                : adapter.listPages().then(() => undefined);

            await withTimeout(probe, READINESS_TIMEOUT_MS);
        } else {
            const healthUrl = (config.bricksProxyHealthUrl as string | undefined) || '';

            await withTimeout(
                probeProxyEndpoint(proxyUrl as string, healthUrl),
                READINESS_TIMEOUT_MS
            );
        }

        return { status: 'ok' };
    } catch (error: unknown) {
        console.error('[Bricks Health] Readiness check failed:', error);

        throw createError({ statusCode: 503, statusMessage: 'Service is not ready' });
    }
});
