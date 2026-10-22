/**
 * Types of the public contract of the publish store.
 */

import type { IBricksSchema } from '../../../common/types/brick';
import type {
    IPublishedPage,
    TPublishedPageSummary,
    TPublishFormState,
} from '../../../common/types/bricks-api';
import type { IBricksPageAddress } from '../../../common/types/pageAddress';

/**
 * Options of a writing operation of the store that outlives its own session.
 *
 * `currentFormState`, `editingPageId` and `generalError` are shared state: while
 * the request is in flight a person may open another page, and the rollback or the
 * error message of the previous one would smear over that page's form (already
 * filled in by the bootstrap). The store knows nothing about sessions, so the
 * decision is handed to the caller — the builder passes the check of its own token
 * in here, while the dashboard and the direct calls pass nothing.
 */
export interface IPublishOperationOptions {
    /** Whether the session the request went out from is still current. Yes by default */
    isInitiatorCurrent?: () => boolean;
}

/**
 * The state of the registry of the unfinished write operations — what
 * `utils/activeWrites.ts` operates on.
 */
export interface IActiveWriteRegistry {
    activeWriteIds: number[];
    nextWriteId: number;
}

/**
 * The narrow contract of the store for the one-off load of the full page list
 * (`utils/pagesLoad.ts`).
 */
export interface IPagesLoadStoreDeps {
    /**
     * The moment of the last full answer of the server; `null` — the list was
     * never loaded.
     */
    pagesLoadedAt: number | null;
    /** The number of the last request started — stale answers are cut off by it */
    pagesRequestId: number;
    publishedPages: TPublishedPageSummary[];
    loadAllPages: () => Promise<void>;
}

/**
 * The narrow contract of the store for writing pages outside an editor session
 * (`utils/pageLibraryWrite.ts`).
 */
export interface IPageLibraryWriteStoreDeps {
    getPageById: (id: string | number) => TPublishedPageSummary | undefined;
    isAddressAvailable: (address: IBricksPageAddress, excludeId?: string | number) => boolean;
    publishPage: (schema: IBricksSchema, formState: TPublishFormState) => Promise<number>;
}

/**
 * The narrow contract of the store for a rollback of a page to a version
 * (`utils/pageVersionRestore.ts`).
 */
export interface IVersionRestoreStoreDeps {
    getPageById: (id: string | number) => { revision?: number } | undefined;
    syncPageInList: (page: IPublishedPage) => void;
    loadAllPages: () => Promise<void>;
}

/**
 * The narrow contract of the store for the local writes into the page list
 * (`utils/pagesListWrite.ts`) — DI instead of a direct import of the store, so that
 * the logic is tested without Pinia.
 */
export interface IPagesListWriteStoreDeps {
    publishedPages: TPublishedPageSummary[];
}

/**
 * The narrow contract of the store for the write operations of the current landing
 * (`utils/currentPageWrite.ts`) — DI instead of a direct import of the store, so
 * that the logic is tested without Pinia.
 */
export interface ICurrentPageWriteStoreDeps {
    currentFormState: TPublishFormState;
    validationErrors: Record<string, string>;
    generalError: string;
    editingPageId: string | number | null;
    lastSuccessfulSaveAt: number;
    beginWrite: () => number | null;
    endWrite: (writeId: number) => void;
    isAddressAvailable: (address: IBricksPageAddress, excludeId?: string | number) => boolean;
    validateCurrentFormState: () => boolean;
    syncPageInList: (page: IPublishedPage) => void;
    loadAllPages: () => Promise<void>;
    updatePage: (
        id: string | number,
        schema: IBricksSchema,
        formState: TPublishFormState
    ) => Promise<void>;
    publishPage: (schema: IBricksSchema, formState: TPublishFormState) => Promise<number>;
}
