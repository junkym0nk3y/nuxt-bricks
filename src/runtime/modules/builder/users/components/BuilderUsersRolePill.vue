<script setup lang="ts">
/**
 * @description The role pill in an account row: it is the role picker button as well.
 * A menu of three roles, the choice is applied at once — the section has no separate
 * "edit the account" form at all, because an account has no content, only attributes,
 * and each of them is edited where it is shown.
 *
 * A locked role (one's own account, the last active administrator) is drawn NOT as a
 * disabled button but as a button with `aria-disabled` and an explanation of the
 * reason: a disabled element leaves the keyboard order together with the reason, while
 * the reason is the only thing a person needs here ("appoint a second administrator
 * first"). The menu is not wired up at all in that case: there is nothing to open.
 *
 * Decisions held by the style section: in both busy states — a request of its own and
 * an operation in a neighboring row — the pill dims yet stays focusable, because
 * otherwise focus would leave the list for the time the server takes to answer; the
 * chevron appears on hover, on focus and on an open menu, so that a row at rest stays
 * a list of data rather than a set of buttons, while the room for it is taken at all
 * times — otherwise the pill would jerk in width under the cursor.
 */

// #region Imports
// Types
import type { TBricksBadgeTone } from '../../../ui/base/badge/types';
import type { TBricksUserRole } from '../../../common/types/auth';
import type { IUsersRolePillProps, IUsersRolePillEmits } from '../types/users';

// Constants
import { USER_ROLE_ORDER } from '../constants/roles';

// Vue
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';

// Reka UI
import {
    type AcceptableValue,
    DropdownMenuContent,
    DropdownMenuPortal,
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem,
    DropdownMenuRoot,
    DropdownMenuTrigger,
} from 'reka-ui';

// Components
import BricksPopoverSurface from '../../../ui/base/popover/BricksPopoverSurface.vue';
import BricksBadge from '../../../ui/base/badge/BricksBadge.vue';
// #endregion

// #region Props
const props = withDefaults(defineProps<IUsersRolePillProps>(), {
    isLocked: false,
    lockedHint: '',
    isPending: false,
    isOperationLocked: false,
});
// #endregion

// #region Emits
const emit = defineEmits<IUsersRolePillEmits>();
// #endregion

// #region Data
const { t } = useI18n();

/**
 * The badge tone per role. A map rather than colors in styles of its own: the tones
 * live in the kit, and what is left here is only the mapping "role → how much it has
 * to stand out".
 */
const ROLE_TONE: Record<TBricksUserRole, TBricksBadgeTone> = {
    admin: 'accent',
    editor: 'muted',
    viewer: 'quiet',
};

/** The menu is open. The component owns the state: an opening can be refused */
const isMenuOpen = ref<boolean>(false);
// #endregion

// #region Computed
const roleLabel = computed<string>(() => t(`bricks.auth.roles.${props.role}`));

const roleTone = computed<TBricksBadgeTone>(() => ROLE_TONE[props.role]);

/**
 * The accessible name of the button: the role, whose it is and what can be done with
 * it. Inside the button there is only the word of the role, and without the owner's
 * name a screen reader would read out a list of identical "Editor"s.
 */
const triggerLabel = computed<string>(() => {
    const base = t('bricks.users.role.changeLabel', {
        user: props.userLabel,
        role: roleLabel.value,
    });

    return props.isLocked ? `${base}. ${props.lockedHint}` : base;
});
// #endregion

// #region Methods
/**
 * Opens and closes the role menu.
 *
 * An opening is refused while an operation is running in the section: the operations
 * are serialized, and a role picked at that moment would be dropped silently — the
 * menu would be promising an action that is not going to happen. It is the opening
 * that is refused rather than the trigger itself: a disabled button (the stock
 * `disabled` of the reka trigger included) leaves the keyboard order and carries the
 * focus away with it — found by a live check, where a person who changed a role from
 * the keyboard ended up at the top of the page.
 *
 * @param isOpen - The requested state of the menu.
 */
function handleMenuOpenChange(isOpen: boolean): void {
    if (isOpen && props.isOperationLocked) {
        return;
    }

    isMenuOpen.value = isOpen;
}

/**
 * Forwards the chosen role upward.
 *
 * The value of the radio group arrives untyped (reka admits any primitive), so it is
 * checked against the list of known roles: a value outside the list would travel into
 * the request body as it is.
 *
 * @param value - The value of the chosen item.
 */
function handleSelect(value: AcceptableValue): void {
    const role = USER_ROLE_ORDER.find((item) => item === value);

    if (!role || role === props.role) {
        return;
    }

    emit('select', role);
}
// #endregion
</script>

<template>
    <BricksBadge
        v-if="props.isLocked"
        as="button"
        shape="pill"
        :tone="roleTone"
        :class="[$style.BuilderUsersRolePill, $style._locked]"
        aria-disabled="true"
        :title="props.lockedHint"
        :aria-label="triggerLabel"
    >
        <span>{{ roleLabel }}</span>
        <BricksIcon icon="ta:outline-lock" :class="$style.lockIcon" />
    </BricksBadge>

    <DropdownMenuRoot v-else :open="isMenuOpen" @update:open="handleMenuOpenChange">
        <DropdownMenuTrigger as-child>
            <BricksBadge
                as="button"
                shape="pill"
                :tone="roleTone"
                :class="[
                    $style.BuilderUsersRolePill,
                    $style._actionable,
                    props.isPending && $style._pending,
                    props.isOperationLocked && !props.isPending && $style._busy,
                ]"
                :aria-disabled="props.isOperationLocked"
                :aria-label="triggerLabel"
            >
                <span>{{ roleLabel }}</span>
                <BricksIcon icon="ta:outline-chevron-down" :class="$style.chevron" />
            </BricksBadge>
        </DropdownMenuTrigger>

        <DropdownMenuPortal>
            <DropdownMenuContent as-child align="start" :side-offset="6" position="popper">
                <BricksPopoverSurface :class="$style.menu">
                    <DropdownMenuRadioGroup
                        :model-value="props.role"
                        @update:model-value="handleSelect"
                    >
                        <DropdownMenuRadioItem
                            v-for="item in USER_ROLE_ORDER"
                            :key="item"
                            :class="$style.item"
                            :value="item"
                        >
                            <span :class="$style.itemBody">
                                <span :class="$style.itemTitle">{{
                                    t(`bricks.auth.roles.${item}`)
                                }}</span>
                                <span :class="$style.itemDescription">
                                    {{ t(`bricks.users.role.descriptions.${item}`) }}
                                </span>
                            </span>

                            <BricksIcon
                                v-if="item === props.role"
                                icon="ta:outline-check"
                                :class="$style.itemCheck"
                            />
                        </DropdownMenuRadioItem>
                    </DropdownMenuRadioGroup>
                </BricksPopoverSurface>
            </DropdownMenuContent>
        </DropdownMenuPortal>
    </DropdownMenuRoot>
</template>

<style module lang="scss">
.BuilderUsersRolePill {
    transition:
        background-color var(--bricks-default-transition),
        color var(--bricks-default-transition),
        box-shadow var(--bricks-default-transition);

    &._actionable {
        cursor: pointer;

        &:focus-visible {
            outline: none;
            box-shadow: var(--bricks-shadow-focus);
        }
    }

    &._locked {
        cursor: default;
    }

    &._pending {
        opacity: 0.7;
        cursor: progress;
    }

    &._busy {
        opacity: 0.7;
        cursor: default;
    }
}

.chevron {
    width: 1.2rem;
    height: 1.2rem;
    opacity: 0;
    transition: opacity var(--bricks-default-transition);

    .BuilderUsersRolePill:hover &,
    .BuilderUsersRolePill:focus-visible &,
    .BuilderUsersRolePill[data-state='open'] & {
        opacity: 1;
    }
}

.lockIcon {
    width: 1.2rem;
    height: 1.2rem;
    color: var(--bricks-primary-400);
}

.menu {
    width: 28rem;
}

.item {
    display: flex;
    align-items: flex-start;
    gap: 0.8rem;
    padding: 0.8rem;
    border-radius: var(--bricks-border-radius-xs);
    transition: background-color var(--bricks-default-transition);
    cursor: pointer;

    &:hover,
    &[data-highlighted] {
        background: var(--bricks-base-50);
        outline: none;
    }

    &[data-state='checked'] {
        .itemTitle {
            color: var(--bricks-primary-600);
        }

        .itemDescription {
            color: var(--bricks-primary-500);
        }
    }
}

.itemBody {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 0.2rem;
}

.itemTitle {
    font-size: 1.4rem;
    font-weight: 600;
    color: var(--bricks-base-900);
}

.itemDescription {
    font-size: 1.2rem;
    color: var(--bricks-base-500);
}

.itemCheck {
    flex-shrink: 0;
    width: 1.6rem;
    height: 1.6rem;
    color: var(--bricks-primary-500);
}
</style>
