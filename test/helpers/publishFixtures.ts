// #region Imports
// Types
import type {
    IPublishedPage,
    TPublishedPageSummary,
    TPublishFormState,
} from '../../src/runtime/modules/common/types/bricks-api';
import type { IPagesLoadStoreDeps } from '../../src/runtime/modules/builder/publish/types/publishStore';
// #endregion

const BASE_PAGE: IPublishedPage = {
    id: 1,
    pagename: 'landing',
    title: 'Landing',
    description: '',
    keywords: '',
    backgroundColor: '#ffffff',
    layout: 'default',
    socialImage: null,
    urlPrefix: null,
    subdomain: null,
    thumbnailUrl: null,
    schema: { components: [] },
    published: true,
    revision: 1,
    createdAt: '2026-07-01T00:00:00Z',
    updatedAt: '2026-07-09T00:00:00Z',
};

const BASE_FORM_STATE: TPublishFormState = {
    pagename: 'landing',
    title: 'Landing',
    description: '',
    keywords: '',
    published: true,
    layout: 'default',
    backgroundColor: '#ffffff',
    socialImage: null,
    urlPrefix: null,
    subdomain: null,
    createdAt: '',
    updatedAt: '',
};

/**
 * Возвращает builder страниц локального списка стора с дефолтами файла.
 *
 * @param defaults - Дефолты конкретного spec-файла поверх базовой страницы.
 * @returns Функция-builder: собирает страницу с переопределениями теста.
 */
export function createPageBuilder(
    defaults: Partial<IPublishedPage> = {}
): (overrides?: Partial<IPublishedPage>) => IPublishedPage {
    return (overrides: Partial<IPublishedPage> = {}) => ({
        ...BASE_PAGE,
        // Свежая схема на каждый вызов — иначе shallow-copy разделяла бы один
        // объект BASE_PAGE.schema между всеми страницами теста
        schema: { components: [] },
        ...defaults,
        ...overrides,
    });
}

/**
 * Возвращает builder состояния формы публикации с дефолтами файла.
 *
 * @param defaults - Дефолты конкретного spec-файла поверх базовой формы.
 * @returns Функция-builder: собирает состояние формы с переопределениями теста.
 */
export function createFormStateBuilder(
    defaults: Partial<TPublishFormState> = {}
): (overrides?: Partial<TPublishFormState>) => TPublishFormState {
    return (overrides: Partial<TPublishFormState> = {}) => ({
        ...BASE_FORM_STATE,
        ...defaults,
        ...overrides,
    });
}

/**
 * Собирает ответ сервера в форме ofetch FetchError с кодом REVISION_CONFLICT.
 *
 * @returns Ошибка, эквивалентная 409-ответу optimistic locking.
 */
export function makeConflictFetchError(): Error {
    return Object.assign(new Error('409 Conflict'), {
        statusCode: 409,
        data: {
            statusCode: 409,
            message: 'Page was modified by someone else. Refresh and try again',
            data: { code: 'REVISION_CONFLICT' },
        },
    });
}

/**
 * Кладёт в стор список так, как его оставил бы полный ответ сервера: вместе со
 * строками ставится отметка загруженности. Без неё стор считает список
 * незагруженным (пустой список — законный ответ) и открытие сессии запрашивает
 * его заново, затирая подготовленные тестом строки.
 *
 * @param store - Publish-стор теста.
 * @param pages - Строки списка.
 */
export function seedLoadedPages(store: IPagesLoadStoreDeps, pages: TPublishedPageSummary[]): void {
    store.publishedPages = pages;
    store.pagesLoadedAt = Date.now();
}
