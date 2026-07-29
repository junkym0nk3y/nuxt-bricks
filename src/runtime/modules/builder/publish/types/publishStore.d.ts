/**
 * Типы публичного контракта publish-стора.
 */

import type { IBricksSchema } from '../../../common/types/brick';
import type { IPublishedPage, TPublishFormState } from '../../../common/types/bricks-api';

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
 * Узкий контракт стора для операций записи текущего лендинга
 * (`utils/currentPageWrite.ts`) — DI вместо прямого импорта стора, чтобы логика
 * тестировалась без Pinia.
 */
export interface ICurrentPageWriteStoreDeps {
    currentFormState: TPublishFormState;
    validationErrors: Record<string, string>;
    generalError: string;
    isSubmitting: boolean;
    editingPageId: string | number | null;
    lastSuccessfulSaveAt: number;
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
