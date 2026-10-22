// #region Imports
// Types
import type { TBricksUserRole } from '../../../common/types/auth';

// Constants
import { BRICKS_ROLE_RANK } from '../../../common/constants/auth';
// #endregion

/**
 * The roles of the accounts section in the order they are listed to a person — from
 * the widest rights to the narrowest.
 *
 * Derived from `BRICKS_ROLE_RANK` rather than written out as a literal: the rank is
 * what the server accepts a role by, and a literal beside it would be a second
 * declaration of the same set — a new role would become valid on the server and
 * silently disappear from the menu of the row, from the form of a new account, or
 * from both.
 *
 * The order itself belongs here rather than to `common`: a listing that repeats the
 * rights matrix reads as a scale rather than as a random list, and that is a decision
 * of this interface, not of the shared contract. The published surface imports the
 * rank as well and has no use for the ordering.
 */
export const USER_ROLE_ORDER: readonly TBricksUserRole[] = (
    Object.keys(BRICKS_ROLE_RANK) as TBricksUserRole[]
).sort((left, right) => BRICKS_ROLE_RANK[right] - BRICKS_ROLE_RANK[left]);
