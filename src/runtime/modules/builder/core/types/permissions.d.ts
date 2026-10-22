/**
 * Types of the builder permissions derived from the account role
 * (`composables/useBuilderPermissions.ts`).
 */
import type { ComputedRef } from 'vue';
import type { TBricksUserRole } from '../../../common/types/auth';

/**
 * Permissions of the current session across the builder and the dashboard.
 *
 * The flags are named after actions, not roles: the endpoints require `editor` for
 * writes and `admin` for deletions, and screen code has to ask "may I delete this"
 * rather than "is this an admin" — otherwise every change of the permission matrix
 * would have to be hunted down through role comparisons scattered over components.
 */
export interface IBuilderPermissions {
    /** Role of the session; `viewer` while the role is unknown (the narrowest one) */
    role: ComputedRef<TBricksUserRole>;
    /**
     * The role has arrived. False means SSR gave no request context (a client-side
     * render) and the `me` endpoint has not answered yet: the interface stays closed
     * for that moment instead of showing actions it may take away right after.
     */
    isRoleKnown: ComputedRef<boolean>;
    /** Saving, publishing, media upload, drag and drop, the properties panel */
    canEdit: ComputedRef<boolean>;
    /** Deletion of pages, versions, media and categories */
    canDelete: ComputedRef<boolean>;
    /** The "Users" section: the admin role AND the module option being on */
    canManageUsers: ComputedRef<boolean>;
    /**
     * The password forms: one's own in the profile, and the "key" that changes
     * someone else's in a row of the account list. There is no role here — anyone
     * signed in changes their own password, a viewer included; someone else's is
     * closed by this flag TOGETHER with `canManageUsers`.
     */
    canChangePassword: ComputedRef<boolean>;
    /**
     * Fetches the role afterwards when the request context did not carry it. The
     * loader is passed in by the composition root: the `me` endpoint lives in the
     * auth domain, which this lower layer cannot see across the module boundaries.
     */
    ensureRole(fetchRole: TFetchSessionRole): Promise<void>;
}

/** Loader of the session role (the `me` endpoint of the auth domain) */
export type TFetchSessionRole = () => Promise<TBricksUserRole | null>;
