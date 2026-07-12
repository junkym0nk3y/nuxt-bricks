/**
 * Nitro-плагин legacy-резолюции backend (bricks.backend.mode не задан).
 *
 * Регистрируется module.ts ТОЛЬКО когда режим выведен legacy-резолвером
 * (module-backend-config.ts), а не задан явно. Единственный эффект — readiness
 * получает право на proxy-ветку пробы (переходный dev-сценарий PROXY_URL без
 * mode); при явном backend.mode ветка недоступна и readiness честно отвечает
 * 503 при несконфигурированном persistence.
 */
import { defineNitroPlugin } from 'nitropack/runtime';
import { markBricksLegacyBackendMode } from '../utils/legacyBackendFlag';

export default defineNitroPlugin(() => {
    markBricksLegacyBackendMode();
});
