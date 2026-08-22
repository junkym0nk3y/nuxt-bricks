<script setup lang="ts">
/**
 * @description An account row: the avatar, the name with the username, the dates of
 * creation and of the last sign-in, the role pill, the sign-in state and the actions.
 *
 * A row rather than a card with a details panel: an account has no content worth
 * unfolding to the side — only attributes, and each of them is edited where it is
 * shown. Everything that needs input (the password) or is irreversible (the deletion)
 * goes into a modal.
 *
 * One's own row differs by a badge and by the set of actions: one can neither take
 * sign-in away from oneself nor delete oneself — otherwise one wrong click takes
 * access away from the very person who hands it out, and there would be nothing to
 * give it back with. One's own password is still changed from here, but by the profile
 * form: the admin endpoint refuses one's own account deliberately (why — at the
 * endpoint, `users/[id]/password.post.ts`).
 *
 * The busy state is announced by the root of the row (`aria-busy`) rather than by its
 * buttons: the state keeps no kind of the operation, and a busy key during a role
 * change would call busy the very thing that was not changing.
 *
 * Decisions held by the style section: an inactive row dims its data rather than itself,
 * because `opacity` on the container would carry away with the data the button that
 * turns sign-in back on — the only reason to come back to such a row — and the focus
 * ring on it; a running operation puts a waiting cursor on the whole row, while the
 * buttons announce it themselves through the `busy` prop, whose own cursor an inherited
 * one would not override; the flex basis of the main cell is its preferred width, so a
 * narrowing row wraps the trailing cells off the line one by one (measured: the actions
 * first, the status next, the role last) instead of squeezing the name and the dates to
 * nothing; the status column carries a width of its own,
 * because the kit badge shrinks to its content while the columns have to line up between
 * rows; and the actions appear on hover and on focus inside the row yet never leave the
 * flow, because `display: none` would take them out of the keyboard order, that is, the
 * section would stop working without a mouse (on devices with no hover they are visible
 * at all times).
 *
 * The username is shown in full and is not clipped: it is what a person signs in with
 * and what they are found by. The creation form keeps it short, but short it is not
 * always — the ceiling of 14 characters is a rule of that form alone, while the column
 * holds `VARCHAR(255)`, nothing rewrites the rows already in it, and a row can be
 * written into the database by hand. That is why a long username wraps INSIDE the word:
 * the allowed format admits a string without a single space or hyphen, so there may be
 * no place for an ordinary line break in it at all. The wrap is made possible by
 * `max-width`; shrinking under its neighbors the username still must not do
 * (`flex-shrink: 0` — the name is what gets clipped first), yet it cannot be wider than
 * the row either.
 */

// #region Imports
// Types
import type { TBricksUserRole } from '../../../common/types/auth';
import type { IUsersListRowProps, IUsersListRowEmits } from '../types/users';

// Vue
import { computed } from 'vue';

// Composables
import { useBuilderPermissions } from '../../core/composables/useBuilderPermissions';
import { useUsersRowLabels } from '../composables/useUsersRowLabels';

// Components
import BricksAvatar from '../../../ui/base/avatar/BricksAvatar.vue';
import BricksBadge from '../../../ui/base/badge/BricksBadge.vue';
import BricksIconButton from '../../../ui/base/icon-button/BricksIconButton.vue';
import BricksSurfaceCard from '../../../ui/base/surface/BricksSurfaceCard.vue';
import BuilderUsersRolePill from './BuilderUsersRolePill.vue';
// #endregion

// #region Props
const props = withDefaults(defineProps<IUsersListRowProps>(), {
    isCurrentUser: false,
    isLastActiveAdmin: false,
    isPending: false,
    isOperationLocked: false,
});
// #endregion

// #region Emits
const emit = defineEmits<IUsersListRowEmits>();
// #endregion

// #region Data
const { canChangePassword } = useBuilderPermissions();

const {
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
} = useUsersRowLabels(props);
// #endregion

// #region Computed
/**
 * Turning sign-in off and deleting will not fire right now: they are either forbidden
 * by a rule or an operation is running in the section, and the operations are
 * serialized.
 *
 * Both states dim the button in the same way but are announced differently: a ban by
 * a rule is permanent and is explained by a hint, while the busy state lasts fractions
 * of a second and lifts by itself.
 */
const isStateActionBlocked = computed<boolean>(
    () => isStateLocked.value || props.isOperationLocked
);

/**
 * A deactivated account has the password key as well: the endpoint does not check the
 * activity of its target, and the safe order of preparing for a sign-in to be turned
 * on is to replace the password first and open sign-in second. A hidden key would
 * impose the reverse: turn the account on with its old (possibly compromised) password
 * and close the hole only with a second request.
 *
 * The installation flag (`allowPasswordChange`) takes the key away from every row: in
 * such an installation the endpoint answers with a refusal, and the button would be
 * promising something that does not exist.
 */
const isPasswordActionVisible = computed<boolean>(() => canChangePassword.value);
// #endregion

// #region Methods
/**
 * Asks for the role of the account to be changed.
 *
 * @param role - The chosen role.
 */
function handleSelectRole(role: TBricksUserRole): void {
    if (props.isOperationLocked) {
        return;
    }

    emit('change-role', props.user, role);
}

/**
 * Opens a password form: one's own (the profile) or the admin one (somebody else's
 * account).
 *
 * The busy state of the section closes this one too: the password change itself does
 * not go through the queue of operations, but a form opened on top of a running
 * operation would show the account in a state that is about to be replaced by the
 * answer of the server.
 */
function handlePasswordAction(): void {
    if (props.isOperationLocked) {
        return;
    }

    if (props.isCurrentUser) {
        emit('change-own-password');
        return;
    }

    emit('set-password', props.user);
}

/**
 * Toggles the ability to sign in: turning it off asks the host for a confirmation,
 * turning it on is applied at once.
 */
function handleToggleActive(): void {
    if (isStateActionBlocked.value) {
        return;
    }

    if (props.user.isActive) {
        emit('deactivate', props.user);
        return;
    }

    emit('activate', props.user);
}

/**
 * Asks for the account to be deleted.
 */
function handleDelete(): void {
    if (isStateActionBlocked.value) {
        return;
    }

    emit('delete', props.user);
}
// #endregion
</script>

<template>
    <BricksSurfaceCard
        as="article"
        :class="[
            $style.BuilderUsersListRow,
            !props.user.isActive && $style._inactive,
            props.isPending && $style._pending,
        ]"
        :aria-busy="props.isPending"
    >
        <BricksAvatar
            :class="$style.avatar"
            size="md"
            :name="userLabel"
            :image-url="props.user.avatarUrl"
        />

        <div :class="$style.main">
            <div :class="$style.titleRow">
                <h3 :class="$style.name">{{ userLabel }}</h3>
                <span v-if="hasSecondaryUsername" :class="$style.username">
                    {{ props.user.username }}
                </span>
                <BricksBadge v-if="props.isCurrentUser" shape="pill" tone="muted">
                    {{ selfBadgeLabel }}
                </BricksBadge>
            </div>
            <p :class="$style.meta">{{ metaText }}</p>
        </div>

        <div :class="$style.roleCell">
            <BuilderUsersRolePill
                :role="props.user.role"
                :is-locked="isRoleLocked"
                :locked-hint="roleLockHint"
                :is-pending="props.isPending"
                :is-operation-locked="props.isOperationLocked"
                :user-label="userLabel"
                @select="handleSelectRole"
            />
        </div>

        <BricksBadge
            tone="plain"
            :dot="props.user.isActive ? 'positive' : 'neutral'"
            :class="$style.statusCell"
        >
            {{ statusLabel }}
        </BricksBadge>

        <div :class="$style.actions">
            <BricksIconButton
                v-if="isPasswordActionVisible"
                icon="ta:outline-key"
                :label="passwordActionLabel"
                :muted="props.isOperationLocked"
                :busy="props.isPending"
                @click="handlePasswordAction"
            />

            <BricksIconButton
                :icon="props.user.isActive ? 'ta:outline-user-off' : 'ta:outline-user-check'"
                :label="toggleActiveLabel"
                :hint="toggleActiveTitle"
                :muted="isStateActionBlocked"
                :busy="props.isPending"
                @click="handleToggleActive"
            />

            <BricksIconButton
                icon="ta:outline-trash"
                :label="deleteLabel"
                :hint="deleteTitle"
                danger
                :muted="isStateActionBlocked"
                :busy="props.isPending"
                @click="handleDelete"
            />
        </div>
    </BricksSurfaceCard>
</template>

<style module lang="scss">
.BuilderUsersListRow {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    min-height: 7.2rem;
    padding: 1.4rem 1.6rem;
    gap: 0.8rem 1.6rem;

    &:hover,
    &:focus-within {
        .actions {
            opacity: 1;
        }
    }

    &._inactive {
        background: var(--bricks-base-50);

        .name {
            color: var(--bricks-base-500);
        }

        .avatar {
            opacity: 0.6;
        }
    }

    &._pending {
        cursor: progress;
    }
}

.main {
    display: flex;
    flex: 1 1 24rem;
    flex-direction: column;
    gap: 0.4rem;
    min-width: 0;
}

.titleRow {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.4rem 0.8rem;
    min-width: 0;
}

.name {
    overflow: hidden;
    margin: 0;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 1.4rem;
    font-weight: 600;
    color: var(--bricks-base-900);
}

.username {
    flex-shrink: 0;
    max-width: 100%;
    font-size: 1.2rem;
    color: var(--bricks-base-400);
    overflow-wrap: anywhere;
}

.meta {
    overflow: hidden;
    margin: 0;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 1.2rem;
    color: var(--bricks-base-400);
}

.roleCell {
    display: flex;
    align-items: center;
    flex-shrink: 0;
    width: 21rem;
}

.statusCell {
    width: 13rem;
    gap: 0.8rem;
}

.actions {
    display: flex;
    flex-shrink: 0;
    margin-left: auto;
    gap: 0.6rem;
    opacity: 0;
    transition: opacity var(--bricks-default-transition);

    @media (hover: none) {
        opacity: 1;
    }
}
</style>
