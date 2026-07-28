import type { EffectScope } from 'vue';
import type { vi } from 'vitest';

import type { useBuilderPagename } from '../../src/runtime/modules/builder/app/composables/useBuilderPagename';
import type { useBuilderSession } from '../../src/runtime/modules/builder/app/composables/useBuilderSession';

/**
 * Контекст, который отдаёт `mountBuilderContext`: scope для очистки и заведённые
 * composables страницы билдера.
 */
export interface IBuilderContext {
    scope: EffectScope;
    pagename: ReturnType<typeof useBuilderPagename>;
    session: ReturnType<typeof useBuilderSession>;
    showToastMock: ReturnType<typeof vi.fn>;
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
