/**
 * Toolbar component types
 */

export interface IToolbarProps {
    isEditingExistingPage: boolean;
    isSubmittingPublish: boolean;
    hasSelectedComponent: boolean;
    isPublishSettingsComplete: boolean;
    sidebarOffset?: string;
    pageTitle?: string;
    isPublished?: boolean;
}

export interface IToolbarEmits {
    openPagesManager: [];
    openMediaGallery: [];
    saveAsCopy: [];
    saveDraft: [];
    preview: [];
    clear: [];
}
