// #region Imports
// Types
import type {
    IBuilderContext,
    IBuilderContextOptions,
    IDeferredApi,
    IDeferredRequest,
    IWindowStub,
} from './types';
import type { IBricksPageAddress } from '../../src/runtime/modules/common/types/pageAddress';
import type { TBuilderDraftPrincipal } from '../../src/runtime/modules/builder/publish/types/builderDrafts';

// Vitest
import { vi } from 'vitest';

// Vue
import { computed, effectScope, onScopeDispose } from 'vue';

// Composables билдера (в spec-файлах их зависимости замоканы через vi.mock —
// моки применяются и к импортам этого helper'а: module id общий)
import { useBuilderSessionAddress } from '../../src/runtime/modules/builder/app/composables/useBuilderSessionAddress';
import { useBuilderSessionAddressSync } from '../../src/runtime/modules/builder/app/composables/useBuilderSessionAddressSync';
import { useBuilderSession } from '../../src/runtime/modules/builder/app/composables/useBuilderSession';
import { useBuilderSessionToken } from '../../src/runtime/modules/builder/app/composables/useBuilderSessionToken';
import { useBuilderDraftPersistence } from '../../src/runtime/modules/builder/app/composables/useBuilderDraftPersistence';
import { usePropertiesPanelAvailability } from '../../src/runtime/modules/builder/core/composables/usePropertiesPanelAvailability';
import { createDraftStorageNotice } from '../../src/runtime/modules/builder/app/utils/draftStorageNotice';
import { getPageAddressKey } from '../../src/runtime/modules/common/utils/bricks/pageAddress';
// #endregion

/**
 * Владелец черновиков в тестах. Ключ черновика включает принципала, поэтому
 * спекам нужен один и тот же — иначе запись и чтение расходятся по namespace'ам.
 */
export const TEST_DRAFT_PRINCIPAL: TBuilderDraftPrincipal = 'database:1';

/**
 * Собирает ключ черновика так же, как это делает draftStorage. Нужен спекам,
 * которые кладут запись в localStorage мимо `setBuilderDraft` — повреждённый JSON
 * или занятый целевой ключ иначе просто не находятся, и кейс зеленеет, не дойдя до
 * проверяемой ветки.
 *
 * @param address - Адрес страницы.
 * @param principal - Владелец черновика (по умолчанию — тестовый).
 * @returns Ключ записи в localStorage.
 */
export function buildTestDraftKey(
    address: IBricksPageAddress,
    principal: TBuilderDraftPrincipal = TEST_DRAFT_PRINCIPAL
): string {
    return `bricks-builder:draft:${principal}:${getPageAddressKey(address)}`;
}

export const AUTOSAVE_DEBOUNCE_MS = 800;
export const ADDRESS_SYNC_DEBOUNCE_MS = 600;

/**
 * Адрес без префикса — короткая запись для тестов, которым префикс не важен.
 *
 * @param pagename - ЧПУ страницы.
 * @returns Адрес страницы.
 */
export function bareAddress(pagename: string): IBricksPageAddress {
    return { pagename, urlPrefix: null };
}

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
export function mountBuilderContext(options: IBuilderContextOptions = {}): IBuilderContext {
    const scope = effectScope();
    const showToastMock = vi.fn();
    const draftStorageUnavailableMock = vi.fn();
    // Право правки по умолчанию есть: session-тесты писались до ролей и проверяют
    // поведение редактора. Роль без правки передаётся явно — она отсекает
    // черновики целиком
    const canEdit = computed<boolean>(() => options.canEdit ?? true);
    // Владелец черновиков — один на связку: запись под одним принципалом и
    // удаление под другим воскресили бы черновик на следующем визите
    const draftPrincipal = options.draftPrincipal ?? TEST_DRAFT_PRINCIPAL;

    const context = scope.run(() => {
        const sessionToken = useBuilderSessionToken();
        // Тот же порядок, что в pages/[pagename].vue: остановка уведомления
        // регистрируется раньше всех прочих хуков очистки
        const draftStorageNotice = createDraftStorageNotice({
            captureSessionToken: sessionToken.capture,
            notify: draftStorageUnavailableMock,
        });
        onScopeDispose(() => {
            draftStorageNotice.stop();
        });
        const sessionAddress = useBuilderSessionAddress({ draftStorageNotice, draftPrincipal });
        const session = useBuilderSession({
            routeAddress: sessionAddress.routeAddress,
            sessionAddress: sessionAddress.sessionAddress,
            showToast: showToastMock,
            renameSession: sessionAddress.renameSession,
            sessionToken,
            draftStorageNotice,
            canEdit,
            draftPrincipal,
        });
        useBuilderDraftPersistence({
            routeAddress: sessionAddress.routeAddress,
            sessionAddress: sessionAddress.sessionAddress,
            isSessionLoading: session.isSessionLoading,
            isSessionReady: session.isSessionReady,
            isDraftRestorePending: session.isDraftRestorePending,
            savedSnapshot: session.savedSnapshot,
            buildCurrentSnapshot: session.buildCurrentSnapshot,
            draftStorageNotice,
            canEdit,
            draftPrincipal,
        });
        useBuilderSessionAddressSync({
            renameSession: sessionAddress.renameSession,
            isSessionReady: session.isSessionReady,
        });
        usePropertiesPanelAvailability(canEdit);
        return { address: sessionAddress, session, sessionToken };
    });

    if (!context) {
        throw new Error('effectScope.run returned no context');
    }

    return { scope, ...context, showToastMock, draftStorageUnavailableMock };
}
