// #region Imports
// Types
import type {
    IPublishedPage,
    TPublishedPageSummary,
    TPublishFormState,
} from '../../src/runtime/modules/common/types/bricks-api';
import type { IPagesLoadStoreDeps } from '../../src/runtime/modules/builder/publish/types/publishStore';
import type { IParsedSchemaFile } from '../../src/runtime/modules/builder/publish/types/composables';
import type { IPreviewWindowStub } from './types';

// Vitest
import { vi } from 'vitest';
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
    viewportConfig: null,
    schema: { components: [] },
    published: true,
    headCode: null,
    bodyEndCode: null,
    noindex: false,
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
    viewportConfig: null,
    headCode: null,
    bodyEndCode: null,
    noindex: false,
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

/**
 * Собирает разобранный файл переноса страницы.
 *
 * По умолчанию — конверт, прямо объявивший наследование набора проекта
 * (`viewportConfig: null`); `kind: 'legacy'` в overrides даёт голую схему из
 * файлов, записанных до появления набора, — у неё поля нет вовсе, и разбор
 * отдаёт `undefined`. Разница не косметическая: `null` снимает собственный набор
 * целевой страницы, `undefined` оставляет его как был.
 *
 * @param filename - Имя файла.
 * @param overrides - Поля разбора поверх дефолтов.
 * @returns Разобранный файл переноса.
 */
export function buildTransferFile(
    filename: string,
    overrides: Partial<IParsedSchemaFile> = {}
): IParsedSchemaFile {
    const kind = overrides.kind ?? 'envelope';

    return {
        schema: { components: [] },
        filename,
        kind,
        viewportConfig: kind === 'legacy' ? undefined : null,
        blocksCount: 0,
        ...overrides,
    };
}

/**
 * Возвращает builder сводок страниц (editorial-список без schema).
 *
 * @param defaults - Дефолты конкретного spec-файла поверх базовой сводки.
 * @returns Функция-builder: собирает сводку с переопределениями теста.
 */
export function createPageSummaryBuilder(
    defaults: Partial<TPublishedPageSummary> = {}
): (overrides?: Partial<TPublishedPageSummary>) => TPublishedPageSummary {
    const { schema: _schema, ...baseSummary } = BASE_PAGE;

    return (overrides: Partial<TPublishedPageSummary> = {}) => ({
        ...baseSummary,
        ...defaults,
        ...overrides,
    });
}

/**
 * A window stub for the preview: localStorage over a Map and a stub of the tab
 * opening. An opened tab is played by an empty object — the code only looks at
 * whether there is one.
 *
 * One for every preview spec: the address that actually travels into `window.open`
 * is checked by three surfaces (the preview of the canvas, a version, a row of the
 * dashboard), and three copies of the stub would drift apart silently.
 *
 * @returns The object for `vi.stubGlobal('window', ...)`.
 */
export function createPreviewWindowStub(): IPreviewWindowStub {
    const data = new Map<string, string>();
    const openedTab = {} as Window;

    return {
        localStorage: {
            getItem: (key: string) => data.get(key) ?? null,
            setItem: (key: string, value: string) => {
                data.set(key, value);
            },
            removeItem: (key: string) => {
                data.delete(key);
            },
        },
        open: vi.fn(() => openedTab),
    };
}
