/**
 * Types of the authorization UI domain (the login page, the session, one's own
 * profile).
 */
import type { ComputedRef, Ref } from 'vue';
import type { TBricksUserRole } from '../../../common/types/auth';

/** Values of the login form. */
export interface IAuthLoginFormValues {
    username: string;
    password: string;
}

/** Values of the "Profile" form. */
export interface IAuthProfileFormValues {
    displayName: string;
}

/** Values of the "Password" form (changing one's own password). */
export interface IAuthOwnPasswordFormValues {
    currentPassword: string;
    newPassword: string;
}

/**
 * Context of the yup schema factories of the auth domain: the translator is passed
 * in from the outside, which is why the function-messages stay reactive to a locale
 * change. The parameters are needed by the messages carrying a bound ("no longer
 * than 64 characters") — the number comes from the shared constant instead of being
 * rewritten into the text of the translation.
 */
export interface IAuthValidationSchemaOptions {
    t: (key: string, params?: Record<string, unknown>) => string;
}

/** Session user in the answers of the auth endpoints (login/me). */
export interface IAuthSessionUserPayload {
    id: number;
    username: string;
    role: TBricksUserRole;
    /**
     * The profile is given out by the `me` endpoint only: the login answer has no
     * use for it — the form leaves the page right away, and the corner of the
     * screen is filled in by the builder already.
     */
    displayName?: string | null;
    avatarUrl?: string | null;
}

/** Answer of the login/me endpoints. */
export interface IAuthSessionResponse {
    user: IAuthSessionUserPayload;
    /**
     * The account password is still the default one (the migration seed) — the
     * builder asks for it to be changed. Given out by `me` only: the login answer
     * has no use for the flag, the form leaves the page right away.
     *
     * Why it travels next to `user` rather than inside it is written down at the
     * endpoint (`server/api/bricks/auth/me.get.ts`) and, for the client state, at
     * `DEFAULT_PASSWORD_STATE_KEY`.
     */
    isDefaultPassword?: boolean;
}

/**
 * Profile of the current session in the application state.
 *
 * Kept apart from `IAuthSessionUserPayload` not out of style: there the name and the
 * photo are optional because the login answer does not carry them — while in the
 * state "there is no photo" and "we do not know whether there is a photo" have to be
 * distinguishable, otherwise the corner of the screen cannot decide whether to draw
 * the letter or to wait. The shape matches the server projection
 * `toAuthProfileUser`, the same one at `auth/me` and at every profile endpoint.
 */
export interface IAuthProfile {
    id: number;
    username: string;
    role: TBricksUserRole;
    displayName: string | null;
    avatarUrl: string | null;
}

/** Answer of the profile endpoints (`PATCH /users/me`, both `users/me/avatar`). */
export interface IAuthProfileResponse {
    user: IAuthProfile;
}

/**
 * Square cropping frame in pixels of the ORIENTED image — the one the browser sees
 * after the EXIF orientation is applied. The server checks the bounds against
 * `metadata().autoOrient`, that is, in these very coordinates.
 */
export interface IAuthAvatarCropFrame {
    left: number;
    top: number;
    side: number;
}

/** Session profile and the operations over it (`useAuthProfile`). */
export interface IUseAuthProfileReturn {
    /** Session profile; null — there are no accounts (basic mode) or it is unknown. */
    profile: ComputedRef<IAuthProfile | null>;
    /**
     * Caption of the owner: the display name, and without one — the login. Computed
     * in a single place because three surfaces read it (the corner, the menu, the
     * modal), and once drifted apart they would show one person two different names.
     */
    displayLabel: ComputedRef<string>;
    /**
     * The password of the current account is still the default one (`admin` /
     * `bricks-pass` out of the migration seed). While it is, the builder shows the
     * request to change it.
     */
    isDefaultPassword: ComputedRef<boolean>;
    /** Fetches the profile when the request context did not carry it (build without SSR). */
    ensureProfile(): Promise<void>;
    /** Writes the display name; an empty string clears it (the login is shown). */
    saveDisplayName(displayName: string): Promise<void>;
    /** Uploads a photo with its cropping frame; puts the new link on the account. */
    uploadAvatar(file: File, frame: IAuthAvatarCropFrame): Promise<void>;
    /** Clears the photo (idempotent). */
    removeAvatar(): Promise<void>;
    /**
     * Changes one's own password. Success tears down EVERY session, the current one
     * included — the caller has to take the person to the login form.
     */
    changeOwnPassword(currentPassword: string, newPassword: string): Promise<void>;
}

/** Props of the "password is still the default" bar. */
export interface IAuthDefaultPasswordNoticeProps {
    /**
     * Whether changing one's own password is available (`auth.allowPasswordChange`).
     * `false` — the warning stays, but without the button: it would lead into a form
     * that does not exist. The warning itself stays true — the password is the same
     * one, it just has to be changed outside the builder.
     *
     * Absent means `false`, as it does for the "Password" tab of the profile modal: a
     * host that forgot the prop hides the way in rather than offering a form that may not
     * be there. The two neighbors used to fail in opposite directions on one and the same
     * flag.
     */
    canChangePassword?: boolean;
}

/** Events of the "password is still the default" bar. */
export interface IAuthDefaultPasswordNoticeEmits {
    /** A request to open the change of one's own password. */
    'change-password': [];
}

/** Tab of the profile modal the modal opens on. */
export type TAuthProfileTab = 'profile' | 'password';

/** Mounting and openness of the profile modal (`useAuthProfileModal`). */
export interface IUseAuthProfileModalReturn {
    /** The modal component has to be kept in the markup (latch of the first open). */
    shouldMount: Ref<boolean>;
    isOpen: Ref<boolean>;
    /**
     * The tab requested at the open. Needed by the second entry point: the key in
     * one's own row of the "Users" section leads exactly into the change of one's
     * own password, while the admin endpoint for someone else's password
     * deliberately refuses on one's own account.
     */
    requestedTab: Ref<TAuthProfileTab>;
    open(tab?: TAuthProfileTab): void;
    close(): void;
}

/** State of the profile photo cropping (`useAuthAvatarCrop`). */
export interface IUseAuthAvatarCropReturn {
    /** Address of the selected file for the preview (object URL); null — no file. */
    imageUrl: Ref<string | null>;
    /** Zoom: 1 — the shorter side of the photo covers the circle exactly. */
    zoom: Ref<number>;
    /** Zoom ceiling — beyond it the frame side would go below the server minimum. */
    maxZoom: ComputedRef<number>;
    /** Preview style of the photo (offset and zoom) — set on the `<img>` in the stage. */
    imageStyle: ComputedRef<Record<string, string>>;
    /** Frame in pixels of the oriented image — what travels to the server. */
    frame: ComputedRef<IAuthAvatarCropFrame | null>;
    /** The file is decoded and the frame can be computed. */
    isReady: ComputedRef<boolean>;
    /** Opens a file: decodes it, sets the initial zoom and centers the frame. */
    openFile(file: File): Promise<void>;
    /** Moves the photo under the circle by a cursor delta in stage pixels. */
    dragBy(deltaX: number, deltaY: number): void;
    /** Releases the object URL and resets the state. */
    release(): void;
}

/** Props of the profile modal. */
export interface IAuthProfileModalProps {
    isOpen: boolean;
    /**
     * Whether the "Password" tab is available. It arrives as a prop from the host
     * instead of being read here: the flag lives in the builder permissions
     * (`useBuilderPermissions`), which the auth domain does not see by the module
     * boundaries. Absent means `false` — the same direction of failure the warning bar
     * takes.
     */
    canChangePassword?: boolean;
    /**
     * The tab the modal opens on. Applied at EVERY open rather than once: otherwise
     * a modal opened on the password once would keep opening on the password from
     * the profile menu.
     */
    initialTab?: TAuthProfileTab;
}

export interface IAuthProfileModalEmits {
    close: [];
    /** Text for the host's toast (a saved name, a removed photo). */
    notify: [message: string, variant: 'success' | 'error'];
}

/** Props of the "Profile" form (photo, name, login, role). */
export interface IAuthProfileDetailsFormProps {
    profile: IAuthProfile;
}

export interface IAuthProfileDetailsFormEmits {
    /** A request for the file selection — cropping lives in a modal of its own. */
    'pick-photo': [];
    close: [];
    notify: [message: string, variant: 'success' | 'error'];
}

export interface IAuthProfilePasswordFormEmits {
    close: [];
}

/** Props of the photo cropping modal. */
export interface IAuthAvatarCropModalProps {
    isOpen: boolean;
    /** The selected file; null — the modal is closed and there is nothing to decode. */
    file: File | null;
}

export interface IAuthAvatarCropModalEmits {
    close: [];
    /** The photo is uploaded and the link on the account is updated. */
    uploaded: [];
    /**
     * The modal has left the DOM (the end of the leave animation). Needed by the
     * owner of the file: clearing it at the start of the closing would mean showing
     * an empty stage for the whole time the modal is traveling away.
     */
    afterLeave: [];
}

export interface IAuthProfileMenuProps {
    /**
     * Whether to draw a vertical rule before the avatar. It is needed in the builder
     * toolbar, where the avatar stands right next to the buttons of the panel; in the
     * dashboard header it is not — there the avatar follows the "+ Page" button,
     * which is an edge of a group by itself. The rule belongs to the component rather
     * than to the surface: outside the database mode the component is not drawn at
     * all, and the line would otherwise hang in the panel alone.
     */
    separated?: boolean;
}

export interface IAuthProfileMenuEmits {
    'open-profile': [];
    logout: [];
}
