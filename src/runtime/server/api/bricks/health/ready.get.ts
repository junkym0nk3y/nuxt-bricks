import { createError, defineEventHandler, setResponseHeader } from 'h3';
import { useRuntimeConfig } from 'nitropack/runtime';
import {
    hasCustomBricksStorageAdapter,
    useBricksStorageAdapter,
} from '../../../../modules/persistence/server/registry';
import { getBricksDefaultStorageFactory } from '../../../../modules/persistence/server/defaultStorage';
import { resolveReadinessTarget } from '../../../utils/readinessTarget';

/** A hung connection or a distant backend must not hang the probe past the timeout */
const READINESS_TIMEOUT_MS = 5000;

/**
 * Wraps a promise in a timeout: it rejects when the time is up, and the timer is
 * always cleared.
 *
 * @param promise - The promise being checked.
 * @param timeoutMs - Timeout in milliseconds.
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
 * GET /api/bricks/health/ready — the readiness probe. It confirms that the
 * persistence adapter is ready; with neither a database, nor an external backend,
 * nor a custom adapter it answers 503. No details are handed outward — the full
 * error goes to the server log.
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

        // An adapter without checkHealth is not considered ready automatically:
        // the fallback is a minimal real editorial request
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
