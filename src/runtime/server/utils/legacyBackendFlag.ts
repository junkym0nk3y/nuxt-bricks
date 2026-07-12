/**
 * Build-time флаг legacy-резолюции backend (bricks.backend.mode не задан).
 *
 * Ставится ТОЛЬКО Nitro-плагином, который module.ts регистрирует при
 * legacy-резолюции (server/plugins/legacyBackendMode.ts) — по построению
 * неизменяем после сборки (env-override невозможен). Единственный потребитель —
 * readiness: proxy-ветка пробы допустима только в legacy-режиме
 * (см. readinessTarget.ts).
 */

let legacyBackendMode = false;

/**
 * Помечает сборку как legacy-резолюцию backend (mode выведен, а не задан).
 */
export function markBricksLegacyBackendMode(): void {
    legacyBackendMode = true;
}

/**
 * Возвращает признак legacy-резолюции backend.
 *
 * @returns true — bricks.backend.mode не был задан явно.
 */
export function isBricksLegacyBackendMode(): boolean {
    return legacyBackendMode;
}
