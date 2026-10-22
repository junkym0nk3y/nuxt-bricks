// #region Imports
// Types
import type { IBuilderPageChromeOptions, IUseBuilderPageChromeReturn } from '../types/session';

// Vue
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

// Nuxt
import { useHead } from '#imports';

// Composables
import { useBuilderPreferences } from '../../core/composables/useBuilderPreferences';
import { useBuilderToast } from '../../core/composables/useBuilderToast';

// Pinia
import { usePublishStore } from '../../publish/stores/publish';
// #endregion

/**
 * The chrome of the editor page: the theme, the language, the `head` of the document
 * and the way out of the session. Everything that dresses the page rather than edits
 * it — the canvas, the session and the writes know nothing of it.
 *
 * The theme and the language come out of `useBuilderPreferences` shared with the
 * dashboard: both surfaces write one cookie, and a second implementation of it
 * drifted apart once already.
 *
 * @param options - The sign-out of the session; the chrome only reports a refusal.
 */
export function useBuilderPageChrome(
    options: IBuilderPageChromeOptions
): IUseBuilderPageChromeReturn {
    const { logout } = options;

    const { t } = useI18n();
    const publishStore = usePublishStore();
    const { showToast } = useBuilderToast();
    const { isDarkMode, bodyClass, toggleDarkMode, toggleLocale } = useBuilderPreferences();

    /**
     * Signs out of the session; on a refusal it shows a toast. There is no confirmation
     * on purpose: an unsaved edit is not lost — the move takes the page away, `pagehide`
     * synchronously writes the deferred draft out, and after the next sign-in the builder
     * will offer to restore it.
     */
    async function handleLogout(): Promise<void> {
        try {
            await logout();
        } catch {
            showToast(t('bricks.auth.logoutFailed'), 'error');
        }
    }

    // The title names the page being edited: a tab of the browser and the history are
    // the only places it shows, and both used to say nothing at all — the editor had no
    // title, so several open pages were indistinguishable. The class of body is built
    // reactively and carries `bricks-dark` under the dark theme; it works on SSR — the
    // cookie is read on the server and the class is rendered at once
    useHead({
        title: computed(() =>
            publishStore.currentFormState.title
                ? `${publishStore.currentFormState.title} — ${t('bricks.publish.dashboard.title')}`
                : t('bricks.publish.dashboard.title')
        ),
        bodyAttrs: {
            class: bodyClass,
        },
    });

    return {
        isDarkMode,
        toggleDarkMode,
        toggleLocale,
        handleLogout,
    };
}
