// #region Imports
// Types
import type { IUsersListRowProps, IUseUsersRowLabelsReturn } from '../types/users';

// Utils
import { formatUserDate, formatUserLoginDate, resolveUserLabel } from '../utils/userFormatting';

// Vue
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
// #endregion

/**
 * The texts of an account row: the caption of the person, the meta line of dates, the
 * accessible names of the buttons and the reasons for the bans.
 *
 * Lifted out of the row whole, because this is its most self-contained part: the texts
 * touch neither the markup nor the events going outward and depend only on the account
 * and its standing (one's own, the last administrator). What is left to the markup is
 * what it actually is — nodes and handlers.
 *
 * The locks are declared here as well rather than next to the handlers, because a lock
 * IS the text of the reason: `isRoleLocked` and `isStateLocked` are derived from the
 * hints, and taking the two halves of one rule into different files would let them
 * drift apart silently.
 *
 * @param props - The properties of the row; read reactively, no snapshot is taken.
 * @returns The captions and the hints of the row.
 */
export function useUsersRowLabels(props: IUsersListRowProps): IUseUsersRowLabelsReturn {
    // #region Data
    const { t } = useI18n();
    // #endregion

    // #region Computed
    const userLabel = computed<string>(() => resolveUserLabel(props.user));

    /**
     * The username next to the name — only when it differs from the shown name: for an
     * account with no display name the title carries the username anyway, and the
     * repeat would look like two different captions of one person.
     */
    const hasSecondaryUsername = computed<boolean>(() => userLabel.value !== props.user.username);

    /**
     * The meta line: when the account was created and when it last signed in.
     *
     * "Never signed in" is not decoration: it is how an administrator finds the
     * accounts that were created and forgotten — and those are exactly the ones that
     * stay as a spare way into the system.
     */
    const metaText = computed<string>(() => {
        const created = t('bricks.users.row.created', {
            date: formatUserDate(props.user.createdAt),
        });
        const login = formatUserLoginDate(props.user.lastLoginAt, {
            today: t('bricks.users.row.today'),
            yesterday: t('bricks.users.row.yesterday'),
        });

        const loginText = login
            ? t('bricks.users.row.lastLogin', { date: login })
            : t('bricks.users.row.neverLoggedIn');

        return `${created} · ${loginText}`;
    });

    /** The badge of one's own row: it is looked for before an action is pressed */
    const selfBadgeLabel = computed<string>(() => t('bricks.users.row.you'));

    const statusLabel = computed<string>(() =>
        props.user.isActive ? t('bricks.users.status.active') : t('bricks.users.status.inactive')
    );

    /**
     * Why the role does not change. One's own account and the last administrator are
     * different reasons, and a shared "not allowed" text would not suggest what to do:
     * in the second case it is enough to appoint a second administrator.
     */
    const roleLockHint = computed<string>(() => {
        if (props.isCurrentUser) {
            return t('bricks.users.row.locks.selfRole');
        }

        return props.isLastActiveAdmin ? t('bricks.users.row.locks.lastAdmin') : '';
    });

    const isRoleLocked = computed<boolean>(() => roleLockHint.value !== '');

    /**
     * Why turning sign-in off and deletion are unavailable.
     */
    const stateLockHint = computed<string>(() => {
        if (props.isCurrentUser) {
            return t('bricks.users.row.locks.self');
        }

        return props.isLastActiveAdmin ? t('bricks.users.row.locks.lastAdmin') : '';
    });

    const isStateLocked = computed<boolean>(() => stateLockHint.value !== '');

    /**
     * The caption of the password button: one's own form and the admin one are
     * different operations.
     */
    const passwordActionLabel = computed<string>(() =>
        props.isCurrentUser
            ? t('bricks.users.row.changeOwnPassword')
            : t('bricks.users.row.setPassword', { user: userLabel.value })
    );

    /** The caption of the sign-in button — by the current state of the account */
    const toggleActiveLabel = computed<string>(() =>
        props.user.isActive
            ? t('bricks.users.row.deactivate', { user: userLabel.value })
            : t('bricks.users.row.activate', { user: userLabel.value })
    );

    /**
     * The hint of the button: a blocked one gets the reason for the ban, an available
     * one the action itself. The accessible name stays the action throughout: the hint
     * explains why the button does not fire but does not undo what it was.
     */
    const toggleActiveTitle = computed<string>(() =>
        isStateLocked.value ? stateLockHint.value : toggleActiveLabel.value
    );

    const deleteLabel = computed<string>(() =>
        t('bricks.users.row.delete', { user: userLabel.value })
    );

    const deleteTitle = computed<string>(() =>
        isStateLocked.value ? stateLockHint.value : deleteLabel.value
    );
    // #endregion

    return {
        userLabel,
        hasSecondaryUsername,
        metaText,
        selfBadgeLabel,
        statusLabel,
        roleLockHint,
        isRoleLocked,
        isStateLocked,
        passwordActionLabel,
        toggleActiveLabel,
        toggleActiveTitle,
        deleteLabel,
        deleteTitle,
    };
}
