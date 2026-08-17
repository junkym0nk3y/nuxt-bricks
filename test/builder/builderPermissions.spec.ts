// #region Imports
// Vitest
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Types
import type { TBricksUserRole } from '../../src/runtime/modules/common/types/auth';
// #endregion

// #region Mocks
/**
 * Публичная конфигурация и контекст запроса, которые подменяет тест. Роль в
 * приложении приходит из `event.context.bricksUser` — её ставит auth-middleware
 * для самой HTML-страницы билдера.
 */
const { runtimePublicConfig, requestContext } = vi.hoisted(() => ({
    runtimePublicConfig: {} as Record<string, unknown>,
    requestContext: { role: null as TBricksUserRole | null },
}));

vi.mock('#imports', async (importOriginal) => {
    const actual = await importOriginal<Record<string, unknown>>();

    return {
        ...actual,
        useRuntimeConfig: () => ({ public: runtimePublicConfig }),
        useRequestEvent: () =>
            requestContext.role === null
                ? undefined
                : { context: { bricksUser: { role: requestContext.role } } },
    };
});

const { useBuilderPermissions } =
    await import('../../src/runtime/modules/builder/core/composables/useBuilderPermissions');
const { resetNuxtStateStub } = await import('../stubs/nuxt-imports');
// #endregion

/**
 * Права билдера считаются по роли сессии. Проверяем источник роли (контекст
 * запроса, досылка ручкой, basic-режим), направление умолчания и флаг раздела
 * учёток.
 */
describe('useBuilderPermissions: права по роли сессии', () => {
    beforeEach(() => {
        resetNuxtStateStub();
        runtimePublicConfig.bricksAuthMode = 'database';
        runtimePublicConfig.bricksAuthAllowUserManagement = true;
        requestContext.role = null;
    });

    it('берёт роль из контекста запроса и не зовёт загрузчик', async () => {
        requestContext.role = 'editor';

        const { canEdit, canDelete, isRoleKnown, ensureRole } = useBuilderPermissions();
        const fetchRole = vi.fn();

        await ensureRole(fetchRole);

        expect(isRoleKnown.value).toBe(true);
        expect(canEdit.value).toBe(true);
        // Удаление страниц, версий и медиа остаётся администратору
        expect(canDelete.value).toBe(false);
        expect(fetchRole).not.toHaveBeenCalled();
    });

    it('без контекста запроса держит самое узкое право до ответа ручки', async () => {
        const { canEdit, isRoleKnown, ensureRole } = useBuilderPermissions();

        // Клиентский рендер (`ssr: false`): роль ещё не выяснена, и показать
        // действия правки «пока не выяснили» значило бы тут же их отобрать
        expect(isRoleKnown.value).toBe(false);
        expect(canEdit.value).toBe(false);

        await ensureRole(async () => 'admin');

        expect(canEdit.value).toBe(true);
    });

    it('не роняет экран отказом ручки — остаётся режим просмотра', async () => {
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const { canEdit, isRoleKnown, ensureRole } = useBuilderPermissions();

        await expect(
            ensureRole(async () => {
                throw new Error('network');
            })
        ).resolves.toBeUndefined();

        expect(isRoleKnown.value).toBe(false);
        expect(canEdit.value).toBe(false);
        consoleError.mockRestore();
    });

    it('в basic-режиме даёт полные права без запроса: учёток там нет вовсе', async () => {
        runtimePublicConfig.bricksAuthMode = 'basic';

        const { canDelete, isRoleKnown, ensureRole } = useBuilderPermissions();
        const fetchRole = vi.fn();

        await ensureRole(fetchRole);

        expect(isRoleKnown.value).toBe(true);
        expect(canDelete.value).toBe(true);
        expect(fetchRole).not.toHaveBeenCalled();
    });

    it('прячет раздел учёток при выключенной опции даже у администратора', () => {
        requestContext.role = 'admin';
        runtimePublicConfig.bricksAuthAllowUserManagement = false;

        const { canDelete, canManageUsers } = useBuilderPermissions();

        expect(canDelete.value).toBe(true);
        expect(canManageUsers.value).toBe(false);
    });

    it('в basic-режиме раздел учёток недоступен: управлять нечем', () => {
        runtimePublicConfig.bricksAuthMode = 'basic';

        expect(useBuilderPermissions().canManageUsers.value).toBe(false);
    });
});
