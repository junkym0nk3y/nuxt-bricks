/**
 * Краевые правила управления учётками — чистые функции, чтобы проверяться
 * юнитами без Postgres (тот же приём, что у правил категорий медиа).
 *
 * Правило одно, но выразить его «в лоб» нельзя: администратора у системы
 * отнимает и понижение роли, и отключение учётки, и её удаление, поэтому проверка
 * идёт по ИТОГОВОМУ состоянию, а не по каждому изменённому полю.
 */
import type { IAuthUserStateChange, IAuthUserStateSnapshot } from '../../types/adapters';

/**
 * Считает итоговое состояние учётки после правки: непереданное поле сохраняет
 * текущее значение.
 *
 * @param target - Состояние до правки.
 * @param change - Запрошенная правка.
 * @returns Состояние после правки.
 */
export function resolveNextUserState(
    target: IAuthUserStateSnapshot,
    change: IAuthUserStateChange
): IAuthUserStateSnapshot {
    return {
        role: change.role ?? target.role,
        isActive: change.isActive ?? target.isActive,
    };
}

/**
 * Проверяет, оставила бы ли операция систему без активного администратора.
 *
 * `activeAdminCount` обязан быть посчитан под блокировкой набора активных
 * админов (`FOR UPDATE`): при READ COMMITTED два одновременных понижения читают
 * одно и то же «админов двое» и оба проходят — write skew, который эта функция
 * сама поймать не может.
 *
 * @param target - Состояние цели, прочитанное под блокировкой.
 * @param next - Итоговое состояние; null — учётка удаляется.
 * @param activeAdminCount - Число активных админов в заблокированном наборе.
 * @returns true — операцию применять нельзя.
 */
export function breaksActiveAdminInvariant(
    target: IAuthUserStateSnapshot,
    next: IAuthUserStateSnapshot | null,
    activeAdminCount: number
): boolean {
    const isTargetActiveAdmin = target.role === 'admin' && target.isActive;

    // Цель не держит систему: либо она не активный админ, либо активный админ
    // есть кто-то ещё. Второй случай — обычный: запрос идёт от администратора,
    // и он сам входит в набор
    if (!isTargetActiveAdmin || activeAdminCount > 1) {
        return false;
    }

    return next === null || next.role !== 'admin' || !next.isActive;
}

/**
 * Проверяет, меняет ли правка состояние учётки. Правка «в то же значение» не
 * пишется вовсе: инкремент поколения выбросил бы человека из его сессии за
 * повторный выбор того же пункта в меню роли.
 *
 * @param target - Состояние до правки.
 * @param next - Итоговое состояние.
 */
export function isUserStateUnchanged(
    target: IAuthUserStateSnapshot,
    next: IAuthUserStateSnapshot
): boolean {
    return target.role === next.role && target.isActive === next.isActive;
}
