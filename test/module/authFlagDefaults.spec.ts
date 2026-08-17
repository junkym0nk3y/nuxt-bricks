// #region Imports
// Vitest
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Types
import type { IBricksModuleOptions } from '../../src/types/module';
import type { IUserManagementFlagResolution } from '../helpers/types';

// Utils
import { applyBricksRuntimeConfig } from '../../src/module-runtime-config';
import { DEFAULT_BRICKS_ROUTE_PREFIXES } from '../../src/runtime/modules/common/utils/bricks/routePaths';
// #endregion

/**
 * Дефолт раздела учёток — «включено», и держится он цепочкой источников
 * значения. Пустая строка в этой цепочке — не «выключено», а «не задано»:
 * `BRICKS_AUTH_ALLOW_USER_MANAGEMENT=` в .env или compose объявляет переменную
 * без значения, а разбор булева флага читает `''` как `false` — раздел исчезал
 * бы у всех, включая администратора.
 */

/**
 * Прогоняет заполнение runtimeConfig и отдаёт получившиеся ключи флага.
 *
 * @param options - Опции модуля из nuxt.config.
 * @returns Server- и public-значения флага управления учётками.
 */
function resolveUserManagementFlag(
    options: IBricksModuleOptions = {}
): IUserManagementFlagResolution {
    const runtimeConfig: Record<string, unknown> = {};

    applyBricksRuntimeConfig(runtimeConfig, options, DEFAULT_BRICKS_ROUTE_PREFIXES, true);

    const publicConfig = runtimeConfig.public as Record<string, unknown>;

    return {
        server: runtimeConfig.bricksAuthAllowUserManagement,
        published: publicConfig.bricksAuthAllowUserManagement,
    };
}

describe('runtimeConfig: флаг управления учётками', () => {
    beforeEach(() => {
        // Резолвер backend'а сообщает о незаданном database.url — для флага
        // учёток это шум
        vi.spyOn(console, 'info').mockImplementation(() => undefined);
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        delete process.env.BRICKS_AUTH_ALLOW_USER_MANAGEMENT;
    });

    afterEach(() => {
        vi.restoreAllMocks();
        delete process.env.BRICKS_AUTH_ALLOW_USER_MANAGEMENT;
    });

    it('включён, когда ни env, ни опция ничего не сказали', () => {
        expect(resolveUserManagementFlag()).toEqual({ server: true, published: true });
    });

    it('пустая env-переменная не выключает раздел: она объявлена, но не задана', () => {
        process.env.BRICKS_AUTH_ALLOW_USER_MANAGEMENT = '';

        expect(resolveUserManagementFlag()).toEqual({ server: true, published: true });
    });

    it('пустая env-переменная не перебивает опцию модуля', () => {
        process.env.BRICKS_AUTH_ALLOW_USER_MANAGEMENT = '   ';

        expect(resolveUserManagementFlag({ auth: { allowUserManagement: false } })).toEqual({
            server: false,
            published: false,
        });
    });

    it('заданное значение env по-прежнему сильнее опции', () => {
        process.env.BRICKS_AUTH_ALLOW_USER_MANAGEMENT = 'false';

        expect(resolveUserManagementFlag({ auth: { allowUserManagement: true } })).toEqual({
            server: 'false',
            published: 'false',
        });
    });
});
