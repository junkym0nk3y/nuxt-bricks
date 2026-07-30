/**
 * Типы публичного контракта publish-стора.
 */

import type { IBricksSchema } from '../../../common/types/brick';
import type {
    IPublishedPage,
    TPublishedPageSummary,
    TPublishFormState,
} from '../../../common/types/bricks-api';

/**
 * Опции записывающей операции стора, которая переживает свою сессию.
 *
 * `currentFormState`, `editingPageId` и `generalError` — общее состояние: за время
 * запроса пользователь может открыть другую страницу, и её форму (уже заполненную
 * bootstrap'ом) откат или сообщение об ошибке прежней затрут. Стор про сессии не
 * знает, поэтому решение отдаётся вызывающему — билдер передаёт сюда проверку
 * своего токена, дашборд и прямые вызовы не передают ничего.
 */
export interface IPublishOperationOptions {
    /** Актуальна ли сессия, из которой ушёл запрос. По умолчанию — да. */
    isInitiatorCurrent?: () => boolean;
}

/**
 * Состояние реестра незавершённых операций записи — то, чем оперирует
 * `utils/activeWrites.ts`.
 */
export interface IActiveWriteRegistry {
    activeWriteIds: number[];
    nextWriteId: number;
}

/**
 * Узкий контракт стора для записи страниц вне сессии редактора
 * (`utils/pageLibraryWrite.ts`).
 */
export interface IPageLibraryWriteStoreDeps {
    getPageById: (id: string | number) => TPublishedPageSummary | undefined;
    isPagenameAvailable: (pagename: string, excludeId?: string | number) => boolean;
    publishPage: (schema: IBricksSchema, formState: TPublishFormState) => Promise<number>;
}

/**
 * Узкий контракт стора для операций записи текущего лендинга
 * (`utils/currentPageWrite.ts`) — DI вместо прямого импорта стора, чтобы логика
 * тестировалась без Pinia.
 */
export interface ICurrentPageWriteStoreDeps {
    currentFormState: TPublishFormState;
    validationErrors: Record<string, string>;
    generalError: string;
    editingPageId: string | number | null;
    lastSuccessfulSaveAt: number;
    beginWrite: () => number | null;
    endWrite: (writeId: number) => void;
    isPagenameAvailable: (pagename: string, excludeId?: string | number) => boolean;
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
