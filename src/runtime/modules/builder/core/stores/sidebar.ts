import { defineStore } from 'pinia';
import type { TSidebarView } from '../../../common/types/brick';

interface ISidebarState {
    left: {
        visible: boolean;
        width: string;
    };
    right: {
        visible: boolean;
        width: string;
    };
    /** Whether the right properties panel mounts at all (see `setPropertiesPanelAvailable`) */
    isPropertiesPanelAvailable: boolean;
    activeView: TSidebarView;
}

/**
 * Owns the state of the builder sidebars: the left one (library / schema / publish)
 * and the right properties panel of the selected component.
 */
export const useSidebarStore = defineStore('bricksSidebar', {
    state: (): ISidebarState => ({
        left: {
            visible: false,
            width: '32rem',
        },
        right: {
            visible: false,
            width: '35rem',
        },
        isPropertiesPanelAvailable: true,
        activeView: 'components',
    }),

    actions: {
        /**
         * Shows the left sidebar and activates the section asked for.
         *
         * @param view - Section to show.
         */
        showSidebarView(view: TSidebarView) {
            // activeView first, the sidebar second: the other order animates twice
            // when a hidden sidebar is opened
            this.activeView = view;
            this.left.visible = true;
        },

        /**
         * Toggles the sidebar for the chosen section.
         *
         * @param view - Section to show.
         */
        toggleSidebarView(view: TSidebarView) {
            const isSameViewVisible = this.left.visible && this.activeView === view;

            if (isSameViewVisible) {
                this.hideSidebar();
                return;
            }

            this.showSidebarView(view);
        },

        /**
         * Hides the left sidebar.
         */
        hideSidebar() {
            this.left.visible = false;
        },

        /**
         * Sets a fixed width of the sidebar.
         *
         * @param width - Width value in rem or px.
         */
        setSidebarWidth(width: string) {
            this.left.width = width;
        },

        /**
         * Switches the active section without touching visibility.
         *
         * @param view - New section.
         */
        setActiveView(view: TSidebarView) {
            this.activeView = view;
        },

        /**
         * Declares whether the right properties panel mounts in this session.
         *
         * For a role without the edit permission the panel does not render at all,
         * while three places subtract its width from the canvas (container width,
         * toolbar offset, recentering). Without this flag, selecting a block — an
         * action a viewer is allowed, it is a highlight and not an edit — would open
         * `right.visible`, and 35rem of emptiness would appear on the right, with the
         * canvas shrinking and rescaling to fit it. The flag keeps `right.visible`
         * meaning "the panel is on screen", so all three calculations hold by
         * construction.
         *
         * @param isAvailable - Whether the panel mounts.
         */
        setPropertiesPanelAvailable(isAvailable: boolean) {
            this.isPropertiesPanelAvailable = isAvailable;

            // The panel may have been open before the edit permission was taken away
            // (in builds without SSR the role arrives by a later request)
            if (!isAvailable) {
                this.right.visible = false;
            }
        },

        /**
         * Shows the right properties panel of the selected component.
         */
        showPropertiesPanel() {
            if (!this.isPropertiesPanelAvailable) {
                return;
            }

            this.right.visible = true;
        },

        /**
         * Hides the right properties panel.
         */
        hidePropertiesPanel() {
            this.right.visible = false;
        },
    },
});
