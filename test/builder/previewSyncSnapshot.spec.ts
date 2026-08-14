// #region Imports
// Vitest
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Vue
import { computed, effectScope, reactive, ref } from 'vue';
// #endregion

/**
 * Снимок содержимого уезжает в превью через `postMessage`, а тот клонирует
 * аргумент structured clone'ом. Reactive-прокси такому клонированию не
 * поддаётся: отправка падала целиком, и превью страницы со своим набором
 * устройств замирало до перезагрузки вкладки.
 */

// #region Mocks
const { publishStoreMock, componentsStoreMock, posted } = vi.hoisted(() => ({
    posted: [] as unknown[],
    publishStoreMock: {
        currentFormState: {
            pagename: 'page-a',
            urlPrefix: null as string | null,
            viewportConfig: null as unknown,
        },
    },
    componentsStoreMock: {
        exportSchema: vi.fn(() => ({ components: [] })),
        $onAction: vi.fn(),
    },
}));

vi.mock('../../src/runtime/modules/builder/publish/stores/publish', () => ({
    usePublishStore: () => publishStoreMock,
}));

vi.mock('../../src/runtime/modules/builder/core/stores/components', () => ({
    useComponentsStore: () => componentsStoreMock,
}));

class FakeBroadcastChannel {
    onmessage: ((event: MessageEvent) => void) | null = null;

    /**
     * Повторяет контракт браузера: аргумент проходит structured clone, и
     * неклонируемое значение роняет вызов, а не уезжает как есть.
     *
     * @param message - Отправляемый снимок.
     */
    postMessage(message: unknown): void {
        posted.push(structuredClone(message));
    }

    /** Закрытие канала тесту не важно, но композабл его зовёт на unmount. */
    close(): void {
        this.onmessage = null;
    }
}

vi.stubGlobal('BroadcastChannel', FakeBroadcastChannel);

// Синк открывает канал только на клиенте: без флага композабл не отправил бы
// ничего, и спека прошла бы мимо проверяемого пути (см. vitest.config.ts)
vi.stubGlobal('__BRICKS_TEST_CLIENT__', true);
// #endregion

import { usePreviewSync } from '../../src/runtime/modules/builder/app/composables/usePreviewSync';

/**
 * Поднимает синк превью с реактивным состоянием формы, как в билдере.
 *
 * @returns Scope и состояние формы для правок.
 */
function mountSync() {
    // Именно реактивное: на плоском объекте watcher набора не сработал бы, и
    // тест прошёл бы мимо проверяемого пути
    const formState = reactive({
        pagename: 'page-a',
        urlPrefix: null as string | null,
        viewportConfig: null as unknown,
    });
    publishStoreMock.currentFormState = formState;

    const token = ref(1);
    const scope = effectScope();
    const api = scope.run(() =>
        usePreviewSync({
            token: computed(() => token.value),
            capture: () => token.value,
            isCurrent: () => true,
            invalidate: () => undefined,
        })
    )!;

    api.startPreviewSync({ pagename: 'page-a', urlPrefix: null });

    return { scope, formState };
}

describe('снимок содержимого для превью', () => {
    beforeEach(() => {
        posted.length = 0;
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('правка набора устройств доезжает и переживает structured clone', async () => {
        const { scope, formState } = mountSync();

        formState.viewportConfig = [
            { key: 'mobile', label: 'Mobile', icon: 'device-mobile', width: 375, aside: 0.4 },
            { key: 'desktop', label: 'Desktop', icon: 'device-desktop', width: 1600, aside: 2 },
        ];

        await vi.advanceTimersByTimeAsync(400);

        expect(posted).toHaveLength(1);
        expect((posted[0] as { viewportConfig: unknown }).viewportConfig).toEqual([
            { key: 'mobile', label: 'Mobile', icon: 'device-mobile', width: 375, aside: 0.4 },
            { key: 'desktop', label: 'Desktop', icon: 'device-desktop', width: 1600, aside: 2 },
        ]);
        scope.stop();
    });
});
