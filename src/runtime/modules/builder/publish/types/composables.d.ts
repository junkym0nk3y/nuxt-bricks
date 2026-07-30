/**
 * Типы композаблов домена publish.
 */

import type { ComputedRef, Ref } from 'vue';
import type { IPageVersionSummary, TPublishedPageSummary } from '../../../common/types/bricks-api';

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
