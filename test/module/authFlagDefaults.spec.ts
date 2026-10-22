// #region Imports
// Vitest
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Types
import type { IBricksModuleOptions } from '../../src/types/module';
import type { IAuthFlagResolution } from '../helpers/types';

// Utils
import { applyBricksRuntimeConfig, resolveBricksDevices } from '../../src/module-runtime-config';
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
function resolveUserManagementFlag(options: IBricksModuleOptions = {}): IAuthFlagResolution {
    const runtimeConfig: Record<string, unknown> = {};

    applyBricksRuntimeConfig(
        runtimeConfig,
        options,
        DEFAULT_BRICKS_ROUTE_PREFIXES,
        true,
        resolveBricksDevices(options.devices)
    );

    const publicConfig = runtimeConfig.public as Record<string, unknown>;

    return {
        server: runtimeConfig.bricksAuthAllowUserManagement,
        published: publicConfig.bricksAuthAllowUserManagement,
    };
}

/**
 * То же для флага смены пароля: у него своя пара ключей и свой env.
 *
 * @param options - Опции модуля из nuxt.config.
 * @returns Server- и public-значения флага смены пароля.
 */
function resolvePasswordChangeFlag(options: IBricksModuleOptions = {}): IAuthFlagResolution {
    const runtimeConfig: Record<string, unknown> = {};

    applyBricksRuntimeConfig(
        runtimeConfig,
        options,
        DEFAULT_BRICKS_ROUTE_PREFIXES,
        true,
        resolveBricksDevices(options.devices)
    );

    const publicConfig = runtimeConfig.public as Record<string, unknown>;

    return {
        server: runtimeConfig.bricksAuthAllowPasswordChange,
        published: publicConfig.bricksAuthAllowPasswordChange,
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
        delete process.env.BRICKS_AUTH_ALLOW_PASSWORD_CHANGE;
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

describe('runtimeConfig: флаг смены пароля', () => {
    beforeEach(() => {
        vi.spyOn(console, 'info').mockImplementation(() => undefined);
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        delete process.env.BRICKS_AUTH_ALLOW_PASSWORD_CHANGE;
    });

    afterEach(() => {
        vi.restoreAllMocks();
        delete process.env.BRICKS_AUTH_ALLOW_PASSWORD_CHANGE;
    });

    it('включён по умолчанию — иначе никто не сменил бы себе пароль', () => {
        expect(resolvePasswordChangeFlag()).toEqual({ server: true, published: true });
    });

    it('не выключается объявленной без значения env-переменной', () => {
        process.env.BRICKS_AUTH_ALLOW_PASSWORD_CHANGE = '';

        expect(resolvePasswordChangeFlag()).toEqual({ server: true, published: true });
    });

    it('выключается опцией модуля и env, не задевая флаг раздела учёток', () => {
        // Флаги независимы: паролями снаружи ведут и там, где раздел учёток нужен
        const runtimeConfig: Record<string, unknown> = {};

        applyBricksRuntimeConfig(
            runtimeConfig,
            { auth: { allowPasswordChange: false } },
            DEFAULT_BRICKS_ROUTE_PREFIXES,
            true,
            resolveBricksDevices(undefined)
        );

        expect(runtimeConfig.bricksAuthAllowPasswordChange).toBe(false);
        expect(runtimeConfig.bricksAuthAllowUserManagement).toBe(true);

        process.env.BRICKS_AUTH_ALLOW_PASSWORD_CHANGE = 'false';

        expect(resolvePasswordChangeFlag({ auth: { allowPasswordChange: true } })).toEqual({
            server: 'false',
            published: 'false',
        });
    });
});
