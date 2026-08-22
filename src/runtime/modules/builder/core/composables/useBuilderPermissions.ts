// #region Imports
// Types
import type { IBuilderPermissions, TFetchSessionRole } from '../types/permissions';
import type { TBricksUserRole } from '../../../common/types/auth';

// Vue
import { computed } from 'vue';

// Utils
import { parseBricksBooleanFlag } from '../../../common/utils/main';

// Constants
import { BRICKS_BASIC_MODE_ROLE, BRICKS_ROLE_RANK } from '../../../common/constants/auth';

// Nuxt
import { useRequestEvent, useRuntimeConfig, useState } from '#imports';
// #endregion

// #region Data
/** Key of the shared role state: one value per application */
const ROLE_STATE_KEY = 'bricks-session-role';

/** Role the permissions are computed from while the real one is unknown */
const FALLBACK_ROLE: TBricksUserRole = 'viewer';
// #endregion

/**
 * Builder permissions derived from the account role.
 *
 * On SSR the role comes from the request context — the auth middleware has already
 * resolved it for the builder HTML page itself, so no extra request is needed and
 * the first frame is painted with the right set of actions straight away. Add a
 * client-side `me` request on top of that, and a viewer would see, for an instant,
 * buttons about to be taken away; default to full permissions instead and the same
 * happens, only with a server rejection at the end. The client request stays as a
 * fallback for builds without SSR (`ssr: false`), where there is no request context
 * at all: the composition root passes it in as the loader of `ensureRole` — the
 * request itself lives in the auth domain, invisible from this lower layer across
 * the module boundaries.
 *
 * Components read the permissions directly instead of receiving them as props: the
 * recursive canvas tree asks for them too, and there a prop would be lost at the
 * first level that forgot to pass it on — while the state here is exactly one per
 * session.
 *
 * @returns The permission flags and the deferred role fetch.
 */
export function useBuilderPermissions(): IBuilderPermissions {
    // #region Data
    const config = useRuntimeConfig();
    const event = useRequestEvent();

    const isDatabaseMode = (config.public?.bricksAuthMode as string | undefined) === 'database';
    // Defaults to on for an unset flag as well as for an empty string:
    // `NUXT_PUBLIC_BRICKS_AUTH_ALLOW_USER_MANAGEMENT=` reaches the built
    // application as `''`, past the build-time normalization
    const isUserManagementAllowed = parseBricksBooleanFlag(
        config.public?.bricksAuthAllowUserManagement,
        true
    );
    // The same default for the same reason: an empty string in a public flag means
    // "not set", not "off"
    const isPasswordChangeAllowedByFlag = parseBricksBooleanFlag(
        config.public?.bricksAuthAllowPasswordChange,
        true
    );

    // In basic mode there are no accounts at all: the identity is one for everybody
    // and comes from the environment, so there is nobody to narrow the permissions
    // for — the role is known at once and needs no request
    const roleState = useState<TBricksUserRole | null>(ROLE_STATE_KEY, () =>
        isDatabaseMode ? (event?.context.bricksUser?.role ?? null) : BRICKS_BASIC_MODE_ROLE
    );
    // #endregion

    // #region Computed
    const role = computed<TBricksUserRole>(() => roleState.value ?? FALLBACK_ROLE);
    const isRoleKnown = computed<boolean>(() => roleState.value !== null);

    const canEdit = computed<boolean>(
        () => BRICKS_ROLE_RANK[role.value] >= BRICKS_ROLE_RANK.editor
    );
    const canDelete = computed<boolean>(
        () => BRICKS_ROLE_RANK[role.value] >= BRICKS_ROLE_RANK.admin
    );
    const canManageUsers = computed<boolean>(
        () => canDelete.value && isDatabaseMode && isUserManagementAllowed
    );
    // The role plays no part: anyone signed in changes their own password, a viewer
    // included. The endpoint for someone else's password is closed by the same flag,
    // but demands `canManageUsers` on top of it
    const canChangePassword = computed<boolean>(
        () => isDatabaseMode && isPasswordChangeAllowedByFlag
    );
    // #endregion

    // #region Methods
    /**
     * Fetches the role afterwards when the request context did not carry it (a build
     * without SSR).
     *
     * A failed request is not rethrown: the composition root calls this before the
     * render, and a failing `me` would take the whole screen down, even though the
     * permissions are already computed from the narrowest role and the interface
     * stays in view mode.
     *
     * @param fetchRole - Role loader from the auth domain.
     */
    async function ensureRole(fetchRole: TFetchSessionRole): Promise<void> {
        if (isRoleKnown.value) {
            return;
        }

        try {
            roleState.value = await fetchRole();
        } catch (error: unknown) {
            console.error('[Builder] Failed to resolve session role:', error);
        }
    }
    // #endregion

    return { role, isRoleKnown, canEdit, canDelete, canManageUsers, canChangePassword, ensureRole };
}
