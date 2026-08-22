<script setup lang="ts">
/**
 * @description The modal of one's own profile: the "Profile" tab (the photo, the
 * display name, the login and the role for viewing) and the "Password" tab (changing
 * one's own password).
 *
 * Two tabs instead of two modals: both edit one and the same account, and splitting
 * them would leave a person hunting for the corner of the screen the second one opens
 * from. At `allowPasswordChange: false` there are no tabs at all — one form is left,
 * because a track of a single tab announces a choice that does not exist.
 *
 * The switch is `BricksTabBar`, that is, a group of buttons with `aria-pressed` rather
 * than a `role="tablist"`. The decision is deliberate: the semantics of tabs promise a
 * screen reader a panel per tab and activate a tab as it receives focus, and bringing in
 * a second tabs primitive for the sake of two forms in one modal would mean duplicating
 * the styles of the pills for a promise that changes nothing here.
 *
 * Cropping lives in a nested modal of its own: showing the circle needs a stage of its
 * own and a footer of its own ("Save photo"), while hiding it inside the form would
 * mean mixing two different steps.
 *
 * Decisions held by the markup: the switch of the tab runs at `mode="out-in"`, because
 * the forms are of different heights and with a simultaneous transition the arriving
 * one would fade in over the leaving one, jumping vertically. The profile tab is drawn
 * only with a profile in the shared session state — without one there is nothing to
 * draw, and the avatar that leads here is not rendered either; the password tab needs
 * no profile and stays reachable from the key in one's own row of the accounts
 * section.
 */

// #region Imports
// Types
import type {
    IAuthProfileModalProps,
    IAuthProfileModalEmits,
    TAuthProfileTab,
} from '../types/auth';

// Utils
import { markLeavingInert } from '../../../common/utils/transitionInert';

// Vue
import { computed, ref, shallowRef, watch } from 'vue';
import { useI18n } from 'vue-i18n';

// Constants
import { BRICKS_AVATAR_MAX_UPLOAD_MB } from '../../../common/constants/auth';

// Composables
import { useAuthProfile } from '../composables/useAuthProfile';

// Components
import BricksModal from '../../../ui/base/modal/BricksModal.vue';
import BricksModalHeader from '../../../ui/base/modal/BricksModalHeader.vue';
import BricksTabBar from '../../../ui/base/tabs/BricksTabBar.vue';
import BuilderAuthProfileAvatarCropModal from './BuilderAuthProfileAvatarCropModal.vue';
import BuilderAuthProfileDetailsForm from './BuilderAuthProfileDetailsForm.vue';
import BuilderAuthProfilePasswordForm from './BuilderAuthProfilePasswordForm.vue';
// #endregion

// #region Props
const props = withDefaults(defineProps<IAuthProfileModalProps>(), {
    canChangePassword: false,
    initialTab: 'profile',
});
// #endregion

// #region Emits
const emit = defineEmits<IAuthProfileModalEmits>();
// #endregion

// #region Data
const { t } = useI18n();
const { profile } = useAuthProfile();

/** Selected tab; with the password change switched off the second is unreachable. */
const activeTab = ref<TAuthProfileTab>('profile');

/**
 * The file selected for cropping; null — the nested modal is closed.
 *
 * `shallowRef` and not `ref`: the ordinary one makes the value deeply reactive, that
 * is, wraps the file into a Proxy — while the file travels into `FormData` and into
 * `decode()`, where the blob itself is needed and not a wrapper around it. Reactivity
 * inside a file is meaningless anyway: it is immutable.
 */
const pendingPhoto = shallowRef<File | null>(null);
const isCropModalOpen = ref(false);
const fileInputRef = ref<HTMLInputElement | null>(null);
// #endregion

// #region Computed
const tabs = computed(() => [
    { value: 'profile', label: t('bricks.auth.profile.tabs.profile') },
    { value: 'password', label: t('bricks.auth.profile.tabs.password') },
]);
// #endregion

// #region Methods
/**
 * Closes the profile modal.
 *
 * While the cropping is open the closing does not go through: an Esc in the crop would
 * otherwise take down both modals at once, whereas it must cancel the choice of the
 * area only. "Cancel" and "Save" of the forms go through this same guard — otherwise
 * the closing would have two paths and one of them would bypass the condition.
 */
function handleClose(): void {
    if (isCropModalOpen.value) {
        return;
    }

    emit('close');
}

/**
 * Switches the tab.
 *
 * @param value - Value of the selected tab.
 */
function handleSelectTab(value: string): void {
    activeTab.value = value === 'password' ? 'password' : 'profile';
}

/**
 * Opens the system file selection — the cropping starts with it.
 */
function handlePickPhoto(): void {
    fileInputRef.value?.click();
}

/**
 * Takes the selected file and opens the cropping.
 *
 * The value of the field is reset right away: without that a repeated selection of the
 * same file yields no `change` event, and a second go at the same photo would look
 * like a button that does not work.
 *
 * The size is checked here — the one check of the content that can honestly be done on
 * the client: the type is confirmed by the signature on the server (anyone can declare
 * `image/png`), but there is no point in pushing a file doomed to a 413 through the
 * network. The ceiling is the same constant the endpoint refuses by.
 *
 * @param event - Event of the file selection field.
 */
function handleFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;

    input.value = '';

    if (!file) {
        return;
    }

    if (file.size > BRICKS_AVATAR_MAX_UPLOAD_MB * 1024 * 1024) {
        emit(
            'notify',
            t('bricks.auth.profile.errors.avatarTooLarge', { max: BRICKS_AVATAR_MAX_UPLOAD_MB }),
            'error'
        );

        return;
    }

    pendingPhoto.value = file;
    isCropModalOpen.value = true;
}

/**
 * Closes the cropping without applying the photo.
 */
function handleCloseCrop(): void {
    isCropModalOpen.value = false;
}

/**
 * The cropping has left the DOM — the file is cleared.
 *
 * On the leaving exactly, not on the closing: `force-mount` holds the departing modal
 * until the end of the animation, and a file cleared at the start would leave a person
 * looking at an empty stage for the whole time it fades out.
 */
function handleCropAfterLeave(): void {
    pendingPhoto.value = null;
}

/**
 * The photo is applied: the cropping closes, while the link in the profile state has
 * already been updated by the answer of the endpoint.
 */
function handlePhotoUploaded(): void {
    isCropModalOpen.value = false;
    emit('notify', t('bricks.auth.profile.toasts.photoSaved'), 'success');
}

/**
 * Forwards a message of a form upwards — the toast is shown by the host.
 *
 * @param message - Text of the message.
 * @param variant - Kind of the message.
 */
function handleNotify(message: string, variant: 'success' | 'error'): void {
    emit('notify', message, variant);
}

/**
 * Kills the interactivity of the leaving view: at `mode="out-in"` it lives in the DOM
 * for the whole leave phase, and the transition is not always driven by a click of the
 * person, that is, focus inside it is possible. The `pointer-events` out of
 * transitions.scss closes off the pointer only.
 *
 * @param element - Root element of the leaving view.
 */
function onViewLeave(element: Element): void {
    markLeavingInert(element);
}
// #endregion

// #region Lifecycle
// The tab is chosen from the requested one at EVERY open rather than remembered
// between them: there are two entry points — the profile menu asks for "Profile", the
// key in one's own row of the accounts section asks for "Password" — and a tab left
// over from the last time would show a person something other than what they opened.
// With the password change switched off a request for the password safely folds into
// the profile: in that mode the tab does not exist at all
watch(
    () => props.isOpen,
    (isOpen) => {
        if (!isOpen) {
            activeTab.value = 'profile';
            return;
        }

        activeTab.value =
            props.initialTab === 'password' && props.canChangePassword ? 'password' : 'profile';
    },
    { immediate: true }
);

// The password change being switched off in the middle of an open modal (a re-read
// config) must not leave the view on an unreachable tab
watch(
    () => props.canChangePassword,
    (isAllowed) => {
        if (!isAllowed) {
            activeTab.value = 'profile';
        }
    }
);
// #endregion
</script>

<template>
    <BricksModal
        :is-open="props.isOpen"
        :title="t('bricks.auth.profile.title')"
        variant="gradient"
        padded
        @close="handleClose"
    >
        <div :class="$style.TheBuilderAuthProfileModal">
            <BricksModalHeader @close="handleClose" />

            <div :class="$style.body">
                <BricksTabBar
                    v-if="props.canChangePassword"
                    :class="$style.tabs"
                    :model-value="activeTab"
                    :items="tabs"
                    :group-label="t('bricks.auth.profile.tabsLabel')"
                    @update:model-value="handleSelectTab"
                />

                <Transition name="bricks-view-switch" mode="out-in" @leave="onViewLeave">
                    <BuilderAuthProfileDetailsForm
                        v-if="profile && activeTab === 'profile'"
                        key="profile"
                        :profile="profile"
                        @pick-photo="handlePickPhoto"
                        @close="handleClose"
                        @notify="handleNotify"
                    />

                    <BuilderAuthProfilePasswordForm
                        v-else-if="props.canChangePassword && activeTab === 'password'"
                        key="password"
                        @close="handleClose"
                    />
                </Transition>
            </div>

            <input
                ref="fileInputRef"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                :class="$style.hiddenInput"
                @change="handleFileSelected"
            />
        </div>
    </BricksModal>

    <BuilderAuthProfileAvatarCropModal
        :is-open="isCropModalOpen"
        :file="pendingPhoto"
        @close="handleCloseCrop"
        @uploaded="handlePhotoUploaded"
        @after-leave="handleCropAfterLeave"
    />
</template>

<style module lang="scss">
.TheBuilderAuthProfileModal {
    overflow: hidden;
    display: flex;
    width: 100%;
    max-width: 52rem;
    flex-direction: column;
    border-radius: var(--bricks-border-radius-md);
    background: var(--bricks-base-0);
    box-shadow: var(--bricks-shadow-lg);
}

.body {
    display: flex;
    flex-direction: column;
    padding: 2rem;
    gap: 1.6rem;
}

.tabs {
    align-self: flex-start;
}

.hiddenInput {
    display: none;
}
</style>
