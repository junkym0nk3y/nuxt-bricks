<script setup lang="ts">
/**
 * @description The avatar in the top right corner and the profile menu under it. One
 * component for two surfaces — the dashboard header and the builder toolbar: the menu
 * answers two questions ("who am I signed in as", "how do I get out of here"), and two
 * copies would drift apart at the very first edit.
 *
 * Before this screen the sign-out lived in the footer of the dashboard rail only, that
 * is, there was no way out of the editor at all — the avatar in the toolbar closes that
 * hole along the way.
 *
 * Outside the database mode the component is not drawn: in basic the identity is one
 * for everybody and is set by the environment, it has no profile, and the protocol
 * itself has no sign-out either — the browser keeps the header until the tab is closed.
 * That is why the component needs no "show the sign-out" prop, it decides that itself.
 *
 * The profile is read out of the shared state rather than arriving as a prop: the value
 * is one per session while there are two surfaces, and the prop would have to be
 * dragged through the dashboard header, which has no use for it. The profile is edited
 * by the modal — that one is opened by the host, so only events leave here.
 *
 * Decisions held by the style section: both lines of the menu header are clipped with
 * an ellipsis, because the width of the menu is fixed and a long name has to be cut
 * either way — the ellipsis is what makes the cut readable instead of a glyph broken
 * mid-way; the appearance and the departure of the popup repeat the other builder
 * popovers, and the rationale of that pair — a closing animation shorter than the
 * opening one with `pointer-events` switched off, and the keyframes declared inside
 * the module block — is written down where it is owned, at
 * `BuilderShellToolbarPageSelector`.
 */

// #region Imports
// Types
import type { IAuthProfileMenuEmits, IAuthProfileMenuProps } from '../types/auth';

// Vue
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

// Reka UI
import {
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuPortal,
    DropdownMenuRoot,
    DropdownMenuTrigger,
} from 'reka-ui';

// Composables
import { useAuthProfile } from '../composables/useAuthProfile';
import { useAuthSession } from '../composables/useAuthSession';

// Components
import BricksAvatar from '../../../ui/base/avatar/BricksAvatar.vue';
import BricksMenuItem from '../../../ui/base/popover/BricksMenuItem.vue';
import BricksPopoverSurface from '../../../ui/base/popover/BricksPopoverSurface.vue';
// #endregion

// #region Props
const props = withDefaults(defineProps<IAuthProfileMenuProps>(), {
    separated: false,
});
// #endregion

// #region Emits
const emit = defineEmits<IAuthProfileMenuEmits>();
// #endregion

// #region Data
const { t } = useI18n();
const { isDatabaseMode } = useAuthSession();
const { profile, displayLabel } = useAuthProfile();
// #endregion

// #region Computed
/** Caption under the name: "login · role" — both are about the account, not the profile. */
const accountSummary = computed<string>(() => {
    const current = profile.value;

    if (!current) {
        return '';
    }

    return `${current.username} · ${t(`bricks.auth.roles.${current.role}`)}`;
});

/**
 * Accessible name of the button. Without it the trigger has no caption at all: inside
 * there is only the avatar, and that one is decorative.
 */
const triggerLabel = computed<string>(() =>
    t('bricks.auth.profile.menuLabel', { name: displayLabel.value })
);
// #endregion

// #region Methods
/**
 * Asks the host to open the profile modal.
 */
function handleOpenProfile(): void {
    emit('open-profile');
}

/**
 * Asks the host to sign out: it is the host that shows a failure and leaves for the
 * login.
 */
function handleLogout(): void {
    emit('logout');
}
// #endregion
</script>

<template>
    <DropdownMenuRoot v-if="isDatabaseMode && profile">
        <div :class="$style.BuilderAuthProfileMenu">
            <span v-if="props.separated" :class="$style.divider" aria-hidden="true" />

            <DropdownMenuTrigger as-child>
                <button type="button" :class="$style.trigger" :aria-label="triggerLabel">
                    <BricksAvatar size="sm" :name="displayLabel" :image-url="profile.avatarUrl" />
                </button>
            </DropdownMenuTrigger>

            <DropdownMenuPortal>
                <DropdownMenuContent as-child align="end" :side-offset="8" position="popper">
                    <BricksPopoverSurface :class="$style.menu">
                        <div :class="$style.header">
                            <BricksAvatar
                                size="md"
                                :name="displayLabel"
                                :image-url="profile.avatarUrl"
                            />

                            <div :class="$style.identity">
                                <span :class="$style.name">{{ displayLabel }}</span>
                                <span :class="$style.summary">{{ accountSummary }}</span>
                            </div>
                        </div>

                        <div :class="$style.items">
                            <DropdownMenuItem as-child @select="handleOpenProfile">
                                <BricksMenuItem
                                    icon="ta:outline-user"
                                    :label="t('bricks.auth.profile.open')"
                                />
                            </DropdownMenuItem>

                            <DropdownMenuItem as-child @select="handleLogout">
                                <BricksMenuItem
                                    icon="ta:outline-logout"
                                    :label="t('bricks.auth.logout')"
                                />
                            </DropdownMenuItem>
                        </div>
                    </BricksPopoverSurface>
                </DropdownMenuContent>
            </DropdownMenuPortal>
        </div>
    </DropdownMenuRoot>
</template>

<style module lang="scss">
.BuilderAuthProfileMenu {
    display: inline-flex;
    align-items: center;
    gap: 1.2rem;
}

.divider {
    width: 1px;
    height: 2.4rem;
    background: var(--bricks-base-200);
}

.trigger {
    display: inline-flex;
    padding: 0;
    border-radius: var(--bricks-border-radius-pill);
    border: none;
    background: transparent;
    transition: box-shadow var(--bricks-default-transition);
    cursor: pointer;

    &:hover,
    &[data-state='open'] {
        box-shadow: 0 0 0 0.2rem var(--bricks-base-200);
    }

    &:focus-visible {
        outline: none;
        box-shadow: var(--bricks-shadow-focus);
    }
}

.menu {
    width: 26.8rem;

    &[data-state='open'] {
        animation: profile-menu-in 0.2s ease;
    }

    &[data-state='closed'] {
        animation: profile-menu-out 0.15s ease;
        pointer-events: none;
    }

    @media (prefers-reduced-motion: reduce) {
        &[data-state='open'],
        &[data-state='closed'] {
            animation: none;
        }
    }
}

@keyframes profile-menu-in {
    from {
        opacity: 0;
        transform: translateY(-0.4rem);
    }

    to {
        opacity: 1;
        transform: translateY(0);
    }
}

@keyframes profile-menu-out {
    from {
        opacity: 1;
        transform: translateY(0);
    }

    to {
        opacity: 0;
        transform: translateY(-0.4rem);
    }
}

.header {
    display: flex;
    align-items: center;
    padding: 0.6rem 0.8rem 1rem;
    border-bottom: 1px solid var(--bricks-base-200);
    gap: 1rem;
}

.identity {
    overflow: hidden;
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
}

.name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 1.4rem;
    font-weight: 600;
    color: var(--bricks-base-900);
}

.summary {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 1.2rem;
    color: var(--bricks-base-400);
}

.items {
    display: flex;
    flex-direction: column;
    padding-top: 0.6rem;
    gap: 0.2rem;
}
</style>
