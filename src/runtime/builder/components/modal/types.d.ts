/**
 * Publish Modal types
 */

export interface IPublishModalProps {
    isOpen: boolean;
    editingPageId?: string;
}

export interface IPublishModalEmits {
    close: [];
    published: [pageId: string];
}

/**
 * Published Pages Modal types
 */

export interface IPublishedPagesModalProps {
    isOpen: boolean;
}

export interface IPublishedPagesModalEmits {
    close: [];
    edit: [pageId: string];
    preview: [pageId: string];
    delete: [pageId: string];
    'load-in-builder': [pageId: string];
    error: [message: string];
}

export interface IPublishedPageCardProps {
    page: import('../../../types/landing-api').IPublishedPage;
    isPublishing?: boolean;
}

export interface IPublishedPageCardEmits {
    preview: [pageId: string];
    edit: [pageId: string];
    delete: [pageId: string];
    togglePublished: [pageId: string, value: boolean];
}

export interface IConfirmActionModalProps {
    isOpen: boolean;
    title: string;
    description?: string;
    confirmText?: string;
    cancelText?: string;
    confirmVariant?: import('../../../ui/base/button/types.d.ts').TIdaButtonVariant;
    isLoading?: boolean;
}

export interface IConfirmActionModalEmits {
    close: [];
    confirm: [];
}

/**
 * Documentation Modal types
 */

export interface IDocumentationModalProps {
    isOpen: boolean;
}

export interface IDocumentationModalEmits {
    close: [];
}
