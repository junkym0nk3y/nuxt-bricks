/**
 * Dev-only server middleware: проксирование не-bricks /api/* запросов на
 * backend host-проекта (PROXY_URL). Регистрируется в module.ts только при
 * `nuxt.options.dev` — в production-сборке middleware не существует.
 *
 * Логика проксирования (чистые правила — server/utils/proxyRouting.ts):
 * - /mock-api/* и /api/bricks/** → НИКОГДА не проксируются (локальные
 *   Nitro-роуты; persistence выбирает bricks.backend.mode, а не PROXY_URL)
 * - остальные /api/* → проксируются на PROXY_URL (если задан)
 *
 * Это позволяет компонентам билдера (.brick.ts) делать API запросы,
 * которые будут проксироваться на backend проекта.
 *
 * Сам handler — createDevProxyEventHandler (server/utils/devProxyHandler.ts,
 * там же контракт передачи заголовков/статусов и интеграционные тесты).
 */

import { useRuntimeConfig } from 'nitropack/runtime';
import { createDevProxyEventHandler } from '../utils/devProxyHandler';

const config = useRuntimeConfig();

export default createDevProxyEventHandler({
    proxyUrl: (config.bricksProxyUrl as string | undefined) || '',
    authMode: config.bricksAuthMode as string,
});
