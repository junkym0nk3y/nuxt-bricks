/**
 * Типы для компонентов домена sidebar.
 */

import type { BricksSchema } from '../../../../common/types/brick';

export interface ISidebarPublishSchemaActionsProps {
    isSubmitting: boolean;
}

export interface ISidebarPublishSchemaActionsEmits {
    importSchema: [schema: BricksSchema];
}

export interface ISidebarPublishSocialImageProps {
    socialImage: string | null;
    isSubmitting: boolean;
}

export interface ISidebarPublishSocialImageEmits {
    openMediaGallery: [];
    clear: [];
}
