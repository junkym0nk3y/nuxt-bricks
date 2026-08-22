import { defineEventHandler, setResponseHeader } from 'h3';

/**
 * GET /api/bricks/health — the liveness probe: the process is alive and answers
 * HTTP. It checks no dependencies (that is readiness — /api/bricks/health/ready)
 * and discloses no environment details: the handler is open without
 * authentication for a load balancer or an orchestrator.
 */
export default defineEventHandler((event) => {
    setResponseHeader(event, 'Cache-Control', 'no-store');

    return { status: 'ok' };
});
