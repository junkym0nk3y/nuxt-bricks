/**
 * Toolbar component types
 */

import type { TPublishedPageSummary } from '../../../../common/types/bricks-api';

export interface IToolbarProps {
    isEditingExistingPage: boolean;
    isSubmittingPublish: boolean;
    hasSelectedComponent: boolean;
    isPublishSettingsComplete: boolean;
    /**
     * The session has opened into a consistent state. Until it has, saving, preview
     * and the media gallery are blocked: saving is out because `startEditingPage`
     * has already filled the form and `editingPageId` while the canvas still holds
     * no schema — the write would overwrite the stored page with an empty canvas;
     * the preview would show a hybrid of the old canvas and the new form; and the
     * gallery is a write surface of its own, where uploads and file edits would
     * happen against a session that is not settled yet.
     */
    isSessionReady: boolean;
    sidebarOffset?: string;
    pageTitle?: string;
    isPublished?: boolean;
    /** Saved pages for the selector in the title */
    pages?: TPublishedPageSummary[];
    /** Identity of the open page: it is the one marked in the list */
    currentPageId?: string | number | null;
    /** The list has already arrived from the server — emptiness is real, not "not loaded yet" */
    isPagesLoaded?: boolean;
    isPagesLoading?: boolean;
    /** A write is in flight: creating a new page is closed for its duration */
    isSubmittingPage?: boolean;
}

export interface IToolbarEmits {
    openPagesManager: [];
    openMediaGallery: [];
    saveAsCopy: [];
    /** Third option of the split button: save the canvas as a template */
    saveAsTemplate: [];
    saveDraft: [];
    preview: [];
    clear: [];
    openPageSelector: [];
    selectPage: [page: TPublishedPageSummary];
    createPage: [];
    /** Profile menu in the corner: open the profile modal */
    openProfile: [];
    /** Profile menu in the corner: leave the session */
    logout: [];
}

/**
 * Props of the page selector in the toolbar title.
 */
export interface IToolbarPageSelectorProps {
    /** Title of the open page — what the trigger shows */
    pageTitle?: string;
    pages: TPublishedPageSummary[];
    currentPageId?: string | number | null;
    /** The full list has been received: an empty result can be shown as the truth */
    isLoaded?: boolean;
    isLoading?: boolean;
    disabled?: boolean;
    isCreateDisabled?: boolean;
}

export interface IToolbarPageSelectorEmits {
    /** The popup was opened — the moment the list is lazily fetched and refreshed */
    open: [];
    select: [page: TPublishedPageSummary];
    allPages: [];
    createPage: [];
}

/**
 * Empty state of the page list: the i18n keys of its title and its explanation.
 */
export interface IToolbarPageSelectorEmptyState {
    title: string;
    description: string;
}
