// #region Imports
// Vitest
import { describe, expect, it } from 'vitest';

// Utils
import {
    breaksActiveAdminInvariant,
    isUserStateUnchanged,
    resolveNextUserState,
} from '../../src/runtime/modules/persistence/server/utils/authUserRules';

// Types
import type { IAuthUserStateSnapshot } from '../../src/runtime/modules/persistence/types/authAdapters';
// #endregion

/** Активный администратор — цель, которую краевое правило и защищает. */
const ACTIVE_ADMIN: IAuthUserStateSnapshot = { role: 'admin', isActive: true };

/**
 * Правило «у системы остаётся активный администратор» считается по ИТОГОВОМУ
 * состоянию: администратора отнимает и понижение роли, и отключение учётки, и её
 * удаление. Проверяем каждый из трёх путей и границу по числу админов.
 */
describe('authUserRules: инвариант активного администратора', () => {
    it('не даёт понизить единственного активного администратора, но даёт понизить одного из двух', () => {
        expect(
            breaksActiveAdminInvariant(ACTIVE_ADMIN, { role: 'editor', isActive: true }, 1)
        ).toBe(true);
        expect(
            breaksActiveAdminInvariant(ACTIVE_ADMIN, { role: 'editor', isActive: true }, 2)
        ).toBe(false);
    });

    it('ловит отключение последнего администратора — роль при этом не меняется', () => {
        expect(
            breaksActiveAdminInvariant(ACTIVE_ADMIN, { role: 'admin', isActive: false }, 1)
        ).toBe(true);
    });

    it('ловит удаление последнего администратора (итоговое состояние — отсутствие учётки)', () => {
        expect(breaksActiveAdminInvariant(ACTIVE_ADMIN, null, 1)).toBe(true);
    });

    it('не защищает отключённого администратора: инвариант держат только активные', () => {
        // Активных админов может не быть вовсе (учётки завели CLI отключёнными) —
        // запрет удаления такой учётки не вернул бы системе администратора
        expect(breaksActiveAdminInvariant({ role: 'admin', isActive: false }, null, 0)).toBe(false);
    });
});

describe('authUserRules: итоговое состояние правки', () => {
    it('сохраняет непереданное поле', () => {
        expect(resolveNextUserState(ACTIVE_ADMIN, { role: 'viewer' })).toEqual({
            role: 'viewer',
            isActive: true,
        });
        expect(resolveNextUserState(ACTIVE_ADMIN, { isActive: false })).toEqual({
            role: 'admin',
            isActive: false,
        });
    });

    it('распознаёт правку без изменений — на ней сессии не рвутся', () => {
        expect(isUserStateUnchanged(ACTIVE_ADMIN, resolveNextUserState(ACTIVE_ADMIN, {}))).toBe(
            true
        );
        expect(
            isUserStateUnchanged(
                ACTIVE_ADMIN,
                resolveNextUserState(ACTIVE_ADMIN, { role: 'admin' })
            )
        ).toBe(true);
        expect(
            isUserStateUnchanged(
                ACTIVE_ADMIN,
                resolveNextUserState(ACTIVE_ADMIN, { isActive: false })
            )
        ).toBe(false);
    });
});
