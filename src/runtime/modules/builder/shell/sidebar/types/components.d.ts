/**
 * Types for the components of the sidebar domain.
 */

export interface ISidebarPublishSocialImageProps {
    socialImage: string | null;
    isSubmitting: boolean;
}

export interface ISidebarPublishSocialImageEmits {
    openMediaGallery: [];
    clear: [];
}
