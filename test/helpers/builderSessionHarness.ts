// #region Imports
// Types
import type { IBuilderContext, IDeferredApi, IDeferredRequest, IWindowStub } from './types';

// Vitest
import { vi } from 'vitest';

// Vue
import { effectScope } from 'vue';

// Composables билдера (в spec-файлах их зависимости замоканы через vi.mock —
// моки применяются и к импортам этого helper'а: module id общий)
import { useBuilderPagename } from '../../src/runtime/modules/builder/app/composables/useBuilderPagename';
import { useBuilderPagenameSync } from '../../src/runtime/modules/builder/app/composables/useBuilderPagenameSync';
import { useBuilderSession } from '../../src/runtime/modules/builder/app/composables/useBuilderSession';
import { useBuilderSessionToken } from '../../src/runtime/modules/builder/app/composables/useBuilderSessionToken';
import { useBuilderDraftPersistence } from '../../src/runtime/modules/builder/app/composables/useBuilderDraftPersistence';
// #endregion

export const AUTOSAVE_DEBOUNCE_MS = 800;
export const PAGENAME_SYNC_DEBOUNCE_MS = 600;

/**
 * Минимальный localStorage поверх Map — черновики билдера в node-окружении.
 *
 * @returns Реализация localStorage для `createWindowStub`.
 */
function createLocalStorageStub(): Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> {
    const data = new Map<string, string>();
    return {
        getItem: (key: string) => data.get(key) ?? null,
        setItem: (key: string, value: string) => {
            data.set(key, value);
        },
        removeItem: (key: string) => {
            data.delete(key);
        },
    };
}

/**
 * Стаб `window` для session-тестов: localStorage поверх Map, таймеры через
 * globalThis (их подменяет vi.useFakeTimers) и минимальная шина событий — jsdom-
 * окружения в наборе нет, а `useBuilderDraftPersistence` слушает `pagehide`.
 * Ключи слушателей держит Map: прототипные имена событий её не задевают.
 *
 * @returns Объект для vi.stubGlobal('window', ...) с рабочим dispatchEvent.
 */
export function createWindowStub(): IWindowStub {
    const listeners = new Map<string, Set<() => void>>();

    return {
        localStorage: createLocalStorageStub(),
        // Number() вместо каста: и node-таймер, и подмена vi.useFakeTimers приводятся
        // к числовому id через Symbol.toPrimitive, а clearTimeout принимает число
        setTimeout: (handler: () => void, timeout?: number) =>
            Number(globalThis.setTimeout(handler, timeout)),
        clearTimeout: (id: number | null) => globalThis.clearTimeout(id ?? undefined),
        addEventListener: (type: string, listener: () => void) => {
            const bucket = listeners.get(type) ?? new Set<() => void>();
            bucket.add(listener);
            listeners.set(type, bucket);
        },
        removeEventListener: (type: string, listener: () => void) => {
            listeners.get(type)?.delete(listener);
        },
        dispatchEvent: (event: { type: string }) => {
            listeners.get(event.type)?.forEach((listener) => listener());
        },
    };
}

/**
 * Реестр отложенных ответов apiFetcher: порядок ответов задаёт тест, поэтому
 * гонка запросов воспроизводится без тайминговых ожиданий. Один и тот же url
 * может ждать в очереди несколько раз (например, два открытия сессии подряд
 * запрашивают список страниц) — обращаться к таким по индексу в `pending`.
 *
 * @returns Очередь запросов и реализация для `apiFetcherMock`.
 */
export function createDeferredApi(): IDeferredApi {
    const pending: IDeferredRequest[] = [];

    return {
        pending,
        handle: (url: string) =>
            new Promise<unknown>((resolve, reject) => {
                pending.push({ url, resolve, reject });
            }),
        waitFor: (url: string) =>
            vi.waitFor(() => {
                const index = pending.findIndex((request) => request.url === url);
                if (index === -1) {
                    throw new Error(`No pending request for ${url}`);
                }

                return pending.splice(index, 1)[0] as IDeferredRequest;
            }),
    };
}

/**
 * Поднимает связку composables страницы билдера в effectScope — та же проводка,
 * что в pages/[pagename].vue (без useBuilderPage: тяжёлые зависимости composable'а
 * — библиотека компонентов, модалки, превью — не нужны для session-тестов).
 *
 * @returns Контекст с scope для очистки и заведёнными composables.
 */
export function mountBuilderContext(): IBuilderContext {
    const scope = effectScope();
    const showToastMock = vi.fn();

    const context = scope.run(() => {
        const pagename = useBuilderPagename();
        const sessionToken = useBuilderSessionToken();
        const session = useBuilderSession({
            routePagename: pagename.routePagename,
            sessionPagename: pagename.sessionPagename,
            showToast: showToastMock,
            renameSession: pagename.renameSession,
            sessionToken,
        });
        useBuilderDraftPersistence({
            routePagename: pagename.routePagename,
            sessionPagename: pagename.sessionPagename,
            isSessionLoading: session.isSessionLoading,
            isSessionReady: session.isSessionReady,
            isRestoreDraftModalOpen: session.isRestoreDraftModalOpen,
            savedSnapshot: session.savedSnapshot,
            buildCurrentSnapshot: session.buildCurrentSnapshot,
        });
        useBuilderPagenameSync({
            renameSession: pagename.renameSession,
            isSessionReady: session.isSessionReady,
        });
        return { pagename, session, sessionToken };
    });

    if (!context) {
        throw new Error('effectScope.run returned no context');
    }

    return { scope, ...context, showToastMock };
}
