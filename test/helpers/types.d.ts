import type { EffectScope, Ref } from 'vue';
import type { Mock, vi } from 'vitest';

import type { useBuilderSessionAddress } from '../../src/runtime/modules/builder/app/composables/useBuilderSessionAddress';
import type { useBuilderSession } from '../../src/runtime/modules/builder/app/composables/useBuilderSession';
import type { IBuilderSessionToken } from '../../src/runtime/modules/builder/app/types/session';
import type { TBuilderDraftPrincipal } from '../../src/runtime/modules/builder/publish/types/builderDrafts';

/**
 * Значение auth-флага после заполнения runtimeConfig: серверный ключ и его
 * публичная копия. Проверяются оба — интерфейс решает по публичному, ручки по
 * серверному, и разъехавшись они дали бы разный ответ на один запрос.
 */
export interface IAuthFlagResolution {
    server: unknown;
    published: unknown;
}

/**
 * Опции фейкового события h3 (`createFakeH3Event`).
 */
export interface IFakeH3EventOptions {
    /** Логический путь запроса. */
    path?: string;
    method?: string;
    headers?: Record<string, string>;
    /** Контекст запроса — сюда middleware кладёт пользователя сессии. */
    context?: Record<string, unknown>;
}

/**
 * Опции подъёма контекста билдера в тесте.
 */
export interface IBuilderContextOptions {
    /**
     * Право правки роли (дефолт — есть). `false` поднимает связку так, как её
     * видит наблюдатель: черновики не читаются и не пишутся вовсе.
     */
    canEdit?: boolean;
    /**
     * Владелец черновиков (дефолт — `TEST_DRAFT_PRINCIPAL`). Передаётся явно там,
     * где проверяется разделение черновиков между учётками.
     */
    draftPrincipal?: TBuilderDraftPrincipal | null;
}

/**
 * Контекст, который отдаёт `mountBuilderContext`: scope для очистки и заведённые
 * composables страницы билдера.
 */
export interface IBuilderContext {
    scope: EffectScope;
    address: ReturnType<typeof useBuilderSessionAddress>;
    session: ReturnType<typeof useBuilderSession>;
    /** Токен сессии этого экземпляра — им тесты сверяют операции вне useBuilderSession. */
    sessionToken: IBuilderSessionToken;
    showToastMock: ReturnType<typeof vi.fn>;
    /** Сообщение о недоступном хранилище черновиков — им проверяется однократность. */
    draftStorageUnavailableMock: ReturnType<typeof vi.fn>;
}

/**
 * Отложенный запрос apiFetcher: тест сам решает, когда и чем он ответит.
 */
export interface IDeferredRequest {
    url: string;
    resolve: (value: unknown) => void;
    reject: (error: Error) => void;
}

/**
 * Реестр отложенных ответов apiFetcher — воспроизводит гонки запросов без
 * тайминговых ожиданий: порядок ответов задаёт сам тест.
 */
export interface IDeferredApi {
    /** Ожидающие ответа запросы в порядке вызова. */
    pending: IDeferredRequest[];
    /** Реализация для apiFetcherMock: ставит запрос в очередь и ждёт ответа теста. */
    handle: (url: string) => Promise<unknown>;
    /** Ждёт появления запроса по url и снимает его с очереди. */
    waitFor: (url: string) => Promise<IDeferredRequest>;
}

/**
 * Стаб `window` для session-тестов: только то, чем пользуется код билдера, —
 * localStorage, таймеры и шина событий выгрузки страницы.
 */
export interface IWindowStub {
    localStorage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
    setTimeout: (handler: () => void, timeout?: number) => number;
    clearTimeout: (id: number | null) => void;
    addEventListener: (type: string, listener: () => void) => void;
    removeEventListener: (type: string, listener: () => void) => void;
    dispatchEvent: (event: { type: string }) => void;
}

/**
 * Стаб `window` для тестов превью: localStorage и `open`, чьё возвращаемое
 * значение тест подменяет (блокировщик попапов отдаёт null).
 */
export interface IPreviewWindowStub {
    localStorage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
    open: Mock<(url?: string, target?: string) => Window | null>;
}

/**
 * HTTP-ошибка h3 в том виде, в каком её видит вызывающий обработчик: статус и
 * машиночитаемый код из `data`.
 */
export interface IThrownHttpError {
    statusCode: number;
    statusMessage?: string;
    /**
     * `code` is the machine-readable refusal of the contract; `errorId` is the
     * identifier of the record in the server log a generic 500 hands out in place of
     * the error's internal text.
     */
    data?: { code?: string; errorId?: string };
    /**
     * Текст самой ошибки. Нужен там, где проверяется, что наружу вышла ИМЕННО она:
     * отказ уборки не должен подменять причину отказа операции.
     */
    message?: string;
}

/**
 * Состояние стаба `useAsyncData` — та же форма, что у Nuxt: refs, чтобы
 * `computed` тестируемого кода пересчитывался после повтора.
 */
export interface IAsyncDataStub<TData> {
    data: Ref<TData | null | undefined>;
    error: Ref<unknown>;
    status: Ref<string>;
    refresh: () => Promise<void>;
}

/**
 * Возврат стаба `useAsyncData`: у Nuxt это одновременно объект состояния и
 * промис (`AsyncData = _AsyncData & Promise<_AsyncData>`). Форма важна не для
 * красоты — код читает `data`/`error` до `await`, чтобы успеть зарегистрировать
 * хуки в живом scope, и на просто-промисе такой код бы не работал.
 */
export type TAsyncDataStubResult<TData> = IAsyncDataStub<TData> & Promise<IAsyncDataStub<TData>>;

/**
 * Часть тела multipart-формы для тестового сборщика: файл, если есть
 * `filename`, иначе текстовое поле.
 */
export interface IMultipartBodyPart {
    name: string;
    filename?: string;
    type?: string;
    data: string | Buffer;
}

/** Как отдавать тело запроса тестовому событию. */
export interface IMultipartRequestOptions {
    /** По сколько байт отдавать за раз; по умолчанию — всё тело одним чанком. */
    chunkSize?: number;
    contentType?: string;
    contentLength?: number;
    /** Тело обрывается, не доехав: `complete` остаётся false. */
    cutShort?: boolean;
}
