/**
 * Toolbar component types
 */

export interface ILandingBuilderToolbarProps {
    historyIndex: number;
    historyLength: number;
    isEditingExistingPage: boolean;
    isSubmittingPublish: boolean;
    hasSelectedComponent: boolean;
    isPublishSettingsComplete: boolean;
    showGrid: boolean;
    sidebarOffset?: string;
    pageTitle?: string;
    isPublished?: boolean;
}

export interface ILandingBuilderToolbarEmits {
    openPublishedPages: [];
    openMediaGallery: [];
    saveAsCopy: [];
    saveDraft: [];
    preview: [];
    undo: [];
    redo: [];
    clear: [];
    toggleGrid: [];
}
