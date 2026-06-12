/**
 * Published Pages Modal types
 */

export interface IPublishPagesModalProps {
    isOpen: boolean;
}

export interface IPublishPagesModalEmits {
    close: [];
    edit: [pageId: string];
    preview: [pageId: string];
    delete: [pageId: string];
    'load-in-builder': [pageId: string];
    error: [message: string];
}

export interface IPublishPageCardProps {
    page: import('../../../common/types/bricks-api').IPublishedPage;
    isPublishing?: boolean;
}

export interface IPublishPageCardEmits {
    preview: [pageId: string];
    edit: [pageId: string];
    delete: [pageId: string];
    togglePublished: [pageId: string, value: boolean];
}
