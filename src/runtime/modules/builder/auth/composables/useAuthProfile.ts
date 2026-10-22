// #region Imports
// Types
import type {
    IAuthAvatarCropFrame,
    IAuthProfile,
    IAuthProfileResponse,
    IAuthSessionUserPayload,
    IUseAuthProfileReturn,
} from '../types/auth';

// Vue
import { computed } from 'vue';

// Composables
import { useApiClient } from '../../../common/composables/useApiClient';
import { useAuthSession } from './useAuthSession';

// Constants
import {
    BRICKS_AUTH_REQUEST_TIMEOUT_MS,
    BRICKS_THUMBNAIL_UPLOAD_TIMEOUT_MS,
} from '../../../common/constants/apiTimeouts';

// Nuxt
import { useRequestEvent, useState } from '#imports';
// #endregion

// #region Data
/** Key of the shared profile state: one value per application. */
const PROFILE_STATE_KEY = 'bricks-session-profile';

/**
 * Key of the "the password is still the default" state.
 *
 * Kept apart from the profile deliberately: the profile is overwritten by the answer
 * of every edit (the name, the photo), while the flag belongs not to the profile but
 * to the credentials — were it to share one state with the profile, changing the
 * avatar would erase the warning.
 */
const DEFAULT_PASSWORD_STATE_KEY = 'bricks-session-default-password';

/**
 * Paths of one's own profile endpoints.
 *
 * They have to match the guard literally: the relaxation of the permissions is held
 * by an allowlist of "method + path" pairs (`server/utils/auth/rolePolicy.ts`), and
 * an extra segment or a trailing slash turns an edit of one's own profile into an
 * admin route — a viewer would get a 403 on their own photo.
 */
const PROFILE_ENDPOINT = '/api/bricks/users/me';
const AVATAR_ENDPOINT = '/api/bricks/users/me/avatar';
const OWN_PASSWORD_ENDPOINT = '/api/bricks/users/me/password';
// #endregion

// #region Methods
/**
 * Projects the session user out of the request context onto the client profile.
 *
 * The projection is mandatory rather than "let us pass the object on as it is": the
 * context carries `authVersion` and the active flag, and this state travels into the
 * hydration payload, that is, into the source of the page. The generation of the
 * credentials is of no use to anyone there except whoever sets out to forge it.
 *
 * Any shape of the "who am I" answer is accepted — both the session user out of the
 * context and the payload of the `me` endpoint, where the name and the photo are
 * declared optional (the login answer does not carry them). One shape leaves, in
 * which "there is no photo" is `null` and not `undefined`: otherwise the corner of
 * the screen cannot tell "there is no photo" from "we do not know yet".
 *
 * @param user - Session user or the payload of the `me` endpoint.
 * @returns The public part of the profile, or null when there is no session.
 */
function toClientProfile(user: IAuthSessionUserPayload | undefined): IAuthProfile | null {
    if (!user) {
        return null;
    }

    return {
        id: user.id,
        username: user.username,
        role: user.role,
        displayName: user.displayName ?? null,
        avatarUrl: user.avatarUrl ?? null,
    };
}
// #endregion

/**
 * Profile of the current session: the name, the login, the role and the photo — plus
 * the operations over them.
 *
 * The state is one per application and is filled in by the request context on SSR:
 * the role and the profile have already been resolved by the auth middleware for the
 * HTML page itself, which is why the corner of the screen is drawn in the first frame
 * without a request. The client-side fetch (`ensureProfile`) stays as a fallback for
 * builds without SSR — there is no server markup there at all, so the avatar has
 * nothing to diverge from.
 *
 * The role here is for display (the header of the menu), while the permissions are
 * still computed by `useBuilderPermissions`: one state cannot serve two different
 * questions, and the permissions must not pick up a fresh role in the middle of a
 * session — the canvas, the properties panel and the guards are assembled for the
 * previous one, and on a demotion the server refuses the write anyway.
 *
 * All four profile endpoints give out ONE projection (`toAuthProfileUser`), and every
 * successful edit writes it into this same state: the corner of the dashboard, the
 * corner of the builder and the modal read one value and cannot diverge.
 *
 * @returns Session profile and the operations of editing it.
 */
export function useAuthProfile(): IUseAuthProfileReturn {
    // #region Data
    const event = useRequestEvent();
    const { apiFetcher } = useApiClient();
    const { isDatabaseMode, fetchMe } = useAuthSession();

    const profileState = useState<IAuthProfile | null>(PROFILE_STATE_KEY, () =>
        toClientProfile(event?.context.bricksUser)
    );
    const isDefaultPasswordState = useState<boolean>(
        DEFAULT_PASSWORD_STATE_KEY,
        () => event?.context.bricksUser?.isDefaultPassword ?? false
    );
    // #endregion

    // #region Computed
    const profile = computed<IAuthProfile | null>(() => profileState.value);

    const isDefaultPassword = computed<boolean>(() => isDefaultPasswordState.value);

    const displayLabel = computed<string>(() => {
        const current = profileState.value;

        if (!current) {
            return '';
        }

        return current.displayName?.trim() || current.username;
    });
    // #endregion

    // #region Methods
    /**
     * Fetches the profile with a `me` request when the request context did not carry
     * it.
     *
     * A failure is not thrown outwards: this is called by the composition roots
     * before the first frame, and a failed request would take the whole screen down
     * over an avatar in the corner. In basic mode there is no request at all — no
     * accounts exist there, and there is nothing to edit.
     */
    async function ensureProfile(): Promise<void> {
        if (!isDatabaseMode || profileState.value !== null) {
            return;
        }

        try {
            const session = await fetchMe();

            profileState.value = toClientProfile(session?.user);
            isDefaultPasswordState.value = session?.isDefaultPassword ?? false;
        } catch (error: unknown) {
            console.error('[Builder] Failed to resolve session profile:', error);
        }
    }

    /**
     * Writes the display name.
     *
     * An empty string is not cut off on the client: the server turns it into `null` —
     * and that is exactly the request to show the login instead of a name.
     *
     * @param displayName - New display name.
     */
    async function saveDisplayName(displayName: string): Promise<void> {
        const response = await apiFetcher<IAuthProfileResponse>(PROFILE_ENDPOINT, {
            method: 'PATCH',
            body: { displayName },
            // A short write — one UPDATE of the account row; the shared write
            // ceiling would keep the form button held three times longer than needed
            timeout: BRICKS_AUTH_REQUEST_TIMEOUT_MS,
        });

        profileState.value = response.user;
    }

    /**
     * Uploads a photo with its cropping frame.
     *
     * The content type is not set by hand: `FormData` assembles it together with the
     * boundary, while one given manually would leave the request without a boundary —
     * and the server would answer "multipart/form-data expected".
     *
     * @param file - Source file of the photo.
     * @param frame - Frame in pixels of the oriented image.
     */
    async function uploadAvatar(file: File, frame: IAuthAvatarCropFrame): Promise<void> {
        const formData = new FormData();

        formData.append('file', file);
        formData.append('cropX', String(frame.left));
        formData.append('cropY', String(frame.top));
        formData.append('cropSide', String(frame.side));

        const response = await apiFetcher<IAuthProfileResponse>(AVATAR_ENDPOINT, {
            method: 'POST',
            body: formData,
            // Sending the file plus a pass of sharp and the upload into the storage
            // — the same order of work as the preview snapshot of a page
            timeout: BRICKS_THUMBNAIL_UPLOAD_TIMEOUT_MS,
        });

        profileState.value = response.user;
    }

    /**
     * Clears the profile photo.
     */
    async function removeAvatar(): Promise<void> {
        const response = await apiFetcher<IAuthProfileResponse>(AVATAR_ENDPOINT, {
            method: 'DELETE',
        });

        profileState.value = response.user;
    }

    /**
     * Changes one's own password.
     *
     * The ceiling is the shared one for writes (30 s) rather than the short one of
     * the login: the endpoint makes TWO scrypt passes (verifying the current one and
     * hashing the new one) under a shared semaphore, and on a busy server ten seconds
     * are not enough for it.
     *
     * There is no answer carrying a profile here and there cannot be: success tears
     * down every session, the current one included, and the cookie is cleared by that
     * same answer. The profile state is left alone — the caller takes the person to
     * the login form.
     *
     * @param currentPassword - Current password (always required).
     * @param newPassword - New password.
     */
    async function changeOwnPassword(currentPassword: string, newPassword: string): Promise<void> {
        await apiFetcher(OWN_PASSWORD_ENDPOINT, {
            method: 'POST',
            body: { currentPassword, newPassword },
        });
    }
    // #endregion

    return {
        profile,
        displayLabel,
        isDefaultPassword,
        ensureProfile,
        saveDisplayName,
        uploadAvatar,
        removeAvatar,
        changeOwnPassword,
    };
}
