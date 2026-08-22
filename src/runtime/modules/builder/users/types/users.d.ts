/**
 * Types of the dashboard's "Users" section: the state of the list, the filters, the
 * forms and the component contracts.
 *
 * The account itself is described in `common/types/auth` (`IBricksUserSummary`) —
 * the shape of the endpoint response is one for the server and the client, and a
 * second declaration here would silently diverge from the server one.
 */
import type { ComputedRef, Ref } from 'vue';
import type { IBricksUserSummary, TBricksUserRole } from '../../../common/types/auth';
import type { TBricksToastVariant } from '../../../ui/feedback/types';

/** The list's segment filter by the ability to sign in */
export type TUsersFilter = 'all' | 'active' | 'inactive';

export interface IUsersFilterCounts {
    all: number;
    active: number;
    inactive: number;
}

/**
 * The loading state of the section.
 *
 * `unavailable` is kept apart from `error` on purpose: a 404 means the section is not
 * in this installation at all (turned off by a flag, the mode is not database) and a
 * 403 means the role of this caller is not an administrator's — neither of them gets
 * better on a retry, and in that state the rail item disappears. Everything else (the
 * network, 5xx, an abort by the waiting ceiling) is a temporary breakage: the section
 * stays in place with a retry button.
 */
export type TUsersStatus = 'idle' | 'loading' | 'ready' | 'error' | 'unavailable';

/**
 * The shared state of the section: the list and whether it has been read.
 *
 * It lives in `useState`, that is, it travels into the hydration payload and is
 * isolated per request: a module-global `ref` would mix the lists of different users
 * inside one server process.
 */
export interface IUsersState {
    users: IBricksUserSummary[];
    status: TUsersStatus;
}

/** The response of `GET /api/bricks/users` */
export interface IUsersListResponse {
    users: IBricksUserSummary[];
}

/** The response of the endpoints handing back one account (creation and a state edit) */
export interface IUserResponse {
    user: IBricksUserSummary;
}

export interface IUseUsersDataReturn {
    users: ComputedRef<IBricksUserSummary[]>;
    status: ComputedRef<TUsersStatus>;
    /**
     * The number of accounts for the rail counter; `null` — the list has not been
     * read yet. A zero here would be an assertion: there cannot be fewer than one
     * account (somebody did sign in), and a zero drawn during the load would read as
     * a breakage.
     */
    usersCount: ComputedRef<number | null>;
    /** Loads the list unless it has been read already; repeat calls await the first */
    ensureUsers: () => Promise<void>;
    /** Forces a re-read of the list (a retry after a refusal, a check after a conflict) */
    refreshUsers: () => Promise<void>;
    /**
     * The id of the only active administrator; `null` — there is more than one of
     * them or none at all. Counted over the WHOLE list rather than over the visible
     * one: the search and the filter do not change whether the system is left with
     * an administrator.
     */
    lastActiveAdminId: ComputedRef<number | null>;
    /** Puts an account into the list: a new one at the end, a known one in its place */
    upsertUser: (user: IBricksUserSummary) => void;
    /** Takes an account out of the list after a deletion */
    removeUser: (userId: number) => void;
}

export interface IUseUsersListReturn {
    activeFilter: Ref<TUsersFilter>;
    filterCounts: ComputedRef<IUsersFilterCounts>;
    filteredUsers: ComputedRef<IBricksUserSummary[]>;
}

/** What the section's dialog confirms: turning sign-in off or deleting an account */
export type TUsersConfirmKind = 'deactivate' | 'delete';

export interface IUseUsersActionsOptions {
    /** Showing a toast; the variant tells success from a refusal */
    onNotify: (message: string, variant: TBricksToastVariant) => void;
}

export interface IUseUsersActionsReturn {
    /**
     * The account an operation is running on; `null` — all of them are free.
     *
     * The value serves two things at once: the `id` itself names the row being
     * updated, while a non-null value blocks the row actions of EVERY row — the busy
     * state here is one per section rather than a set of busy rows (why — in
     * `useUsersActions`). The markup has to read both meanings: the row whose `id`
     * matches is shown as updating, the rest as temporarily unavailable.
     */
    pendingUserId: ComputedRef<number | null>;
    /** The confirmation dialog is open */
    isConfirmOpen: ComputedRef<boolean>;
    /** The title and the text of the open confirmation */
    confirmTitle: ComputedRef<string>;
    confirmDescription: ComputedRef<string>;
    confirmActionText: ComputedRef<string>;
    /** A confirmed operation is running — the dialog button is in its waiting state */
    isConfirmLoading: ComputedRef<boolean>;
    /** Changes the role of an account */
    changeRole: (user: IBricksUserSummary, role: TBricksUserRole) => Promise<void>;
    /** Turns sign-in on for an account (the reverse of deactivation; asks nothing) */
    activateUser: (user: IBricksUserSummary) => Promise<void>;
    /** Asks for confirmation of turning sign-in off or of a deletion */
    requestConfirm: (kind: TUsersConfirmKind, user: IBricksUserSummary) => void;
    /** Closes the confirmation without performing the operation */
    closeConfirm: () => void;
    /** Performs the confirmed operation */
    confirmAction: () => Promise<void>;
}

/** The values of the account creation form */
export interface IUsersCreateFormValues {
    username: string;
    displayName: string;
    password: string;
    role: TBricksUserRole;
    isActive: boolean;
}

/** The values of the "set someone else's password" form */
export interface IUsersPasswordFormValues {
    password: string;
}

/**
 * The context of the section's yup schema factories: the translator is passed from
 * outside, which is what makes the message functions reactive to a locale change.
 * The bounds inside the messages are taken from the shared constants rather than
 * rewritten as a number into the translation text.
 */
export interface IUsersValidationSchemaOptions {
    t: (key: string, params?: Record<string, unknown>) => string;
}

/**
 * The return values of the forms are deliberately left without interfaces: the
 * signature of the submit handler is set by vee-validate, and a hand-written copy of
 * someone else's contract would diverge from it on the very first update of the
 * library. The login form and the page creation form are built the same way.
 */
export interface IUseUsersCreateFormOptions {
    /** The account is created — the caller closes the modal */
    onCreated: (user: IBricksUserSummary) => void;
}

export interface IUseUsersPasswordFormOptions {
    /** The account being given a password; `null` — the modal is closed */
    user: Ref<IBricksUserSummary | null> | ComputedRef<IBricksUserSummary | null>;
    /** The password is set — the caller closes the modal and shows a toast */
    onSaved: (user: IBricksUserSummary) => void;
}

export interface IUsersSectionProps {
    /** The query from the search field of the dashboard's shared header */
    searchQuery: string;
    /** The creation form is open: the header's primary button opens it */
    isCreateModalOpen: boolean;
    /** The id of one's own account; `null` — the profile is not known yet */
    currentUserId: number | null;
}

export interface IUsersSectionEmits {
    /** The text for the dashboard's toast: there is one toast per surface */
    notify: [message: string, variant: TBricksToastVariant];
    /** The creation form is closed by the host — the host owns it too */
    'close-create-modal': [];
    /** An empty list asks for the first account to be created */
    'create-user': [];
    /** The key in one's own row: open the profile modal on the password tab */
    'change-own-password': [];
}

export interface IUsersListProps {
    users: IBricksUserSummary[];
    activeFilter: TUsersFilter;
    counts: IUsersFilterCounts;
    status: TUsersStatus;
    /**
     * Whether there are any accounts at all — tells "the search found nothing" from
     * an empty list.
     */
    hasAnyUsers: boolean;
    /** The id of one's own account: its row is marked and loses part of the actions */
    currentUserId: number | null;
    /** The only active administrator: their row gets a lock */
    lastActiveAdminId: number | null;
    /**
     * The account an operation is running on; `null` — the section is free. The
     * busy state is shared: that row is shown as updating and the actions of the rest
     * go dim.
     */
    pendingUserId: number | null;
}

export interface IUsersListEmits {
    'update:activeFilter': [filter: TUsersFilter];
    'create-user': [];
    /** A retry of the load after a temporary refusal */
    retry: [];
    'change-role': [user: IBricksUserSummary, role: TBricksUserRole];
    'set-password': [user: IBricksUserSummary];
    /** The key in one's own row: one's own password is changed by the profile form */
    'change-own-password': [];
    activate: [user: IBricksUserSummary];
    deactivate: [user: IBricksUserSummary];
    delete: [user: IBricksUserSummary];
}

export interface IUsersListRowProps {
    user: IBricksUserSummary;
    /** The row of one's own account */
    isCurrentUser?: boolean;
    /**
     * The account is the only active administrator: the role, turning sign-in off
     * and deletion are closed for it, otherwise the management of accounts would be
     * lost whole.
     */
    isLastActiveAdmin?: boolean;
    /** An operation on this very account is running */
    isPending?: boolean;
    /**
     * An operation is running in the section — on this row or on a neighboring one.
     * The actions of the row are unavailable for that time: the busy state is shared
     * per section, and a click on them would be dropped anyway.
     */
    isOperationLocked?: boolean;
}

export interface IUsersListRowEmits {
    'change-role': [user: IBricksUserSummary, role: TBricksUserRole];
    'set-password': [user: IBricksUserSummary];
    'change-own-password': [];
    activate: [user: IBricksUserSummary];
    deactivate: [user: IBricksUserSummary];
    delete: [user: IBricksUserSummary];
}

/**
 * The texts of an account row: the captions, the meta line and the reasons for the
 * bans.
 *
 * The locks are here too rather than in a contract of their own: `isRoleLocked` and
 * `isStateLocked` are derived from the hints (a lock stands exactly when there is a
 * reason), and letting the two halves of one rule drift apart across places would be
 * silent.
 */
export interface IUseUsersRowLabelsReturn {
    /** The display name when it is set, the username otherwise */
    userLabel: ComputedRef<string>;
    /** The username is shown next to the name: it differs from the row's caption */
    hasSecondaryUsername: ComputedRef<boolean>;
    /** When the account was created and when it last signed in */
    metaText: ComputedRef<string>;
    /** The badge of one's own row */
    selfBadgeLabel: ComputedRef<string>;
    statusLabel: ComputedRef<string>;
    /** Why the role does not change; an empty string — there is no lock */
    roleLockHint: ComputedRef<string>;
    isRoleLocked: ComputedRef<boolean>;
    /**
     * Turning sign-in off and deletion are closed by a rule. The reason is not handed
     * outward: it has already gone into the hints of the buttons, and a second way to
     * obtain it would let the text and the flag drift apart.
     */
    isStateLocked: ComputedRef<boolean>;
    /** The accessible names of the buttons carry the owner's caption: a list is read aloud */
    passwordActionLabel: ComputedRef<string>;
    toggleActiveLabel: ComputedRef<string>;
    deleteLabel: ComputedRef<string>;
    /** The hints: a blocked button gets the reason, an available one the action */
    toggleActiveTitle: ComputedRef<string>;
    deleteTitle: ComputedRef<string>;
}

export interface IUsersRolePillProps {
    role: TBricksUserRole;
    /** The caption of the role's owner for the accessible name of the button */
    userLabel: string;
    /**
     * The role does not change: one's own account (rights are not edited around a
     * second administrator) or the last active administrator. The lock explains why.
     */
    isLocked?: boolean;
    /** The reason for the lock, for the hint and for the accessible name */
    lockedHint?: string;
    /** A request changing the role of this account is running */
    isPending?: boolean;
    /** An operation is running in the section: the menu does not open until it ends */
    isOperationLocked?: boolean;
}

export interface IUsersRolePillEmits {
    select: [role: TBricksUserRole];
}

export interface IUsersCreateModalProps {
    isOpen: boolean;
}

export interface IUsersCreateModalEmits {
    close: [];
    created: [user: IBricksUserSummary];
}

export interface IUsersPasswordModalProps {
    /** The account being given a password; `null` — the modal is closed */
    user: IBricksUserSummary | null;
}

export interface IUsersPasswordModalEmits {
    close: [];
    saved: [user: IBricksUserSummary];
}
