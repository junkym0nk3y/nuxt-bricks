/**
 * Toolbar component types
 */

export interface IToolbarProps {
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

export interface IToolbarEmits {
    openPagesManager: [];
    openMediaGallery: [];
    saveAsCopy: [];
    saveDraft: [];
    preview: [];
    undo: [];
    redo: [];
    clear: [];
    toggleGrid: [];
}
