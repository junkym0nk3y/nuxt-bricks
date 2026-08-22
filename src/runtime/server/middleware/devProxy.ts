/**
 * Dev-only server middleware: proxying of non-bricks /api/* requests to the
 * backend of the host project (PROXY_URL). Registered by module.ts only under
 * `nuxt.options.dev` — in a production build the middleware does not exist.
 *
 * The proxying logic (the pure rules live in server/utils/proxyRouting.ts):
 * - /api/bricks/** → NEVER proxied (local Nitro routes; persistence is selected
 *   by bricks.backend.mode, not by PROXY_URL)
 * - the rest of /api/* → proxied to PROXY_URL when it is set
 *
 * This is what lets builder components (.brick.ts) make API requests that get
 * proxied to the backend of the project.
 *
 * The handler itself is createDevProxyEventHandler
 * (server/utils/devProxyHandler.ts, which also carries the transfer contract of
 * headers and statuses and the integration tests).
 */

import { useRuntimeConfig } from 'nitropack/runtime';
import { createDevProxyEventHandler } from '../utils/devProxyHandler';

const config = useRuntimeConfig();

export default createDevProxyEventHandler({
    proxyUrl: (config.bricksProxyUrl as string | undefined) || '',
    authMode: config.bricksAuthMode as string,
});
