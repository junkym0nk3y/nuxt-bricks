// #region Imports
// Vitest
import { vi } from 'vitest';

// Vue
import { effectScope, type EffectScope } from 'vue';

// Composables билдера (в spec-файлах их зависимости замоканы через vi.mock —
// моки применяются и к импортам этого helper'а: module id общий)
import { useBuilderPagename } from '../../src/runtime/modules/builder/app/composables/useBuilderPagename';
import { useBuilderPagenameSync } from '../../src/runtime/modules/builder/app/composables/useBuilderPagenameSync';
import { useBuilderSession } from '../../src/runtime/modules/builder/app/composables/useBuilderSession';
import { useBuilderDraftPersistence } from '../../src/runtime/modules/builder/app/composables/useBuilderDraftPersistence';
// #endregion

export const AUTOSAVE_DEBOUNCE_MS = 800;
export const PAGENAME_SYNC_DEBOUNCE_MS = 600;

export interface IBuilderContext {
    scope: EffectScope;
    pagename: ReturnType<typeof useBuilderPagename>;
    session: ReturnType<typeof useBuilderSession>;
    showToastMock: ReturnType<typeof vi.fn>;
}

/**
 * Минимальный localStorage поверх Map — черновики билдера в node-окружении.
 *
 * @returns Стаб для vi.stubGlobal('window', { localStorage }).
 */
export function createLocalStorageStub(): Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> {
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
        const session = useBuilderSession({
            routePagename: pagename.routePagename,
            sessionPagename: pagename.sessionPagename,
            showToast: showToastMock,
            renameSession: pagename.renameSession,
        });
        useBuilderDraftPersistence({
            sessionPagename: pagename.sessionPagename,
            isSessionLoading: session.isSessionLoading,
            isRestoreDraftModalOpen: session.isRestoreDraftModalOpen,
            savedSnapshot: session.savedSnapshot,
            buildCurrentSnapshot: session.buildCurrentSnapshot,
        });
        useBuilderPagenameSync({ renameSession: pagename.renameSession });
        return { pagename, session };
    });

    if (!context) {
        throw new Error('effectScope.run returned no context');
    }

    return { scope, ...context, showToastMock };
}
