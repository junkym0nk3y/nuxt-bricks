/**
 * The edge rules of account management — pure functions, so that they can be checked
 * by unit tests without Postgres (the same trick as with the media category rules).
 *
 * There is one rule, but it cannot be expressed head-on: the system loses an
 * administrator to a demotion, to an account being switched off and to its deletion
 * alike, which is why the check goes by the RESULTING state rather than by each changed
 * field.
 */
import type { IAuthUserStateChange, IAuthUserStateSnapshot } from '../../types/authAdapters';

/**
 * Computes the account's resulting state after an edit: a field that was not passed
 * keeps its current value.
 *
 * @param target - The state before the edit.
 * @param change - The requested edit.
 * @returns The state after the edit.
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
 * Checks whether the operation would leave the system without an active administrator.
 *
 * `activeAdminCount` must have been counted under a lock on the set of active
 * admins (`FOR UPDATE`): under READ COMMITTED two simultaneous demotions read the same
 * "there are two admins" and both go through — a write skew this function cannot catch
 * on its own.
 *
 * @param target - The target's state, read under the lock.
 * @param next - The resulting state; null — the account is being deleted.
 * @param activeAdminCount - The number of active admins in the locked set.
 * @returns true — the operation must not be applied.
 */
export function breaksActiveAdminInvariant(
    target: IAuthUserStateSnapshot,
    next: IAuthUserStateSnapshot | null,
    activeAdminCount: number
): boolean {
    const isTargetActiveAdmin = target.role === 'admin' && target.isActive;

    // The target does not hold the system up: either it is not an active admin, or
    // somebody else is one. The second case is the ordinary one: the request comes
    // from an administrator, who is part of the set themselves
    if (!isTargetActiveAdmin || activeAdminCount > 1) {
        return false;
    }

    return next === null || next.role !== 'admin' || !next.isActive;
}

/**
 * Checks whether the edit changes the account's state. An edit "to the same value" is
 * not written at all: an increment of the generation would throw the person out of
 * their session for picking the same item in the role menu again.
 *
 * @param target - The state before the edit.
 * @param next - The resulting state.
 */
export function isUserStateUnchanged(
    target: IAuthUserStateSnapshot,
    next: IAuthUserStateSnapshot
): boolean {
    return target.role === next.role && target.isActive === next.isActive;
}
