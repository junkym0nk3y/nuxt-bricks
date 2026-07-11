import { defineEventHandler, setResponseHeader } from 'h3';

/**
 * GET /api/bricks/health — liveness probe: процесс жив и отвечает на HTTP.
 * Зависимости не проверяет (это readiness — /api/bricks/health/ready) и
 * деталей окружения не раскрывает: ручка открыта без авторизации для
 * load balancer / оркестратора.
 */
export default defineEventHandler((event) => {
    setResponseHeader(event, 'Cache-Control', 'no-store');

    return { status: 'ok' };
});
