/**
 * Типы для компонентов домена sidebar.
 */

export interface ISidebarPublishSocialImageProps {
    socialImage: string | null;
    isSubmitting: boolean;
}

export interface ISidebarPublishSocialImageEmits {
    openMediaGallery: [];
    clear: [];
}
