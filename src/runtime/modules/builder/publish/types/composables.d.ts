/**
 * Типы композаблов домена publish.
 */

import type { ComputedRef, Ref } from 'vue';
import type {
    IPageVersion,
    IPageVersionSummary,
    TPublishedPageSummary,
} from '../../../common/types/bricks-api';
import type { IBricksSchema } from '../../../common/types/brick';

// #region usePublishVersionRestore
/**
 * Опции `usePublishVersionRestore`.
 */
export interface IUsePublishVersionRestoreOptions {
    onNotify: (message: string, variant: 'success' | 'error') => void;
}

/**
 * Страница и версия, ожидающие подтверждения отката.
 */
export interface IPendingVersionRestore {
    page: TPublishedPageSummary;
    version: IPageVersionSummary;
}

/**
 * Возвращаемое значение `usePublishVersionRestore`.
 */
export interface IUsePublishVersionRestoreReturn {
    isRestoreConfirmationOpen: Ref<boolean>;
    isRestoring: Ref<boolean>;
    restoreConfirmationDescription: ComputedRef<string>;
    requestRestoreVersion: (page: TPublishedPageSummary, version: IPageVersionSummary) => void;
    closeRestoreConfirmation: (force?: boolean) => void;
    confirmRestoreVersion: () => Promise<void>;
}
// #endregion

// #region usePublishPageVersions
/**
 * Возвращаемое значение `usePublishPageVersions`.
 */
export interface IUsePublishPageVersionsReturn {
    versions: Ref<IPageVersionSummary[]>;
    isLoading: ComputedRef<boolean>;
    previewingVersionId: Ref<number | null>;
    loadVersions: (pageId: string | number) => Promise<void>;
    previewVersion: (page: TPublishedPageSummary, versionId: number) => Promise<void>;
    /** Очищает список и обесценивает летящий запрос (переключение страницы). */
    resetVersions: () => void;
}
// #endregion

// #region usePublishDetailsUrl
/**
 * Реактивные поля формы панели деталей, участвующие в live-URL.
 */
export interface IPublishDetailsUrlFields {
    pagename: Ref<string>;
    urlPrefix: Ref<string>;
    subdomain: Ref<string>;
}

/**
 * Возвращаемое значение `usePublishDetailsUrl`.
 */
export interface IPublishDetailsUrlReturn {
    liveUrl: ComputedRef<string>;
    copyLiveUrl: () => Promise<boolean>;
}
// #endregion

// #region usePublishPreview
/**
 * Возвращаемое значение `usePublishPreview`.
 */
export interface IUsePublishPreviewReturn {
    previewCurrentPage: (schema: IBricksSchema) => string | null;
    previewPageVersion: (page: TPublishedPageSummary, version: IPageVersion) => string | null;
    generatePreviewUrl: (pagename: string) => string;
}
// #endregion
