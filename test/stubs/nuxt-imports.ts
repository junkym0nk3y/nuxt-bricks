/**
 * Минимальный стаб `#imports` для unit-тестов (подключается через
 * `resolve.alias` в vitest.config.ts). Покрывает только то, что реально
 * дёргается в тестируемых модулях вне Nuxt-контекста.
 */

// #region Imports
// Vue
import { shallowRef, type Ref } from 'vue';
// #endregion

// #region Data
/**
 * Состояния `useState` по ключу. У Nuxt это состояние живёт столько же, сколько
 * приложение (на сервере — сколько запрос), то есть переживает размонтирование
 * страницы; стаб повторяет это модульной картой, а тесты сбрасывают её между
 * кейсами через `resetNuxtStateStub`.
 */
const stateByKey = new Map<string, Ref<unknown>>();

/** Отложенные колбэки `onNuxtReady` — исполняются тестом вручную. */
const nuxtReadyCallbacks: Array<() => unknown> = [];

/**
 * Экземпляр приложения Nuxt. Один на «жизнь приложения», как в самом Nuxt: по
 * нему код ключует состояние, привязанное к запросу (например, идущую загрузку в
 * `WeakMap`), и новый объект на каждый вызов ломал бы ровно ту изоляцию, ради
 * которой этот ключ и выбран.
 */
let nuxtApp: Record<string, unknown> = {};
// #endregion

/**
 * Стаб useState: одно состояние на ключ, инициализатор зовётся один раз.
 *
 * @param key - Ключ состояния.
 * @param init - Начальное значение.
 * @returns Ссылка на состояние.
 */
export function useState<T>(key: string, init?: () => T): Ref<T> {
    const existing = stateByKey.get(key);

    if (existing) {
        return existing as Ref<T>;
    }

    const created = shallowRef<T>(init ? init() : (undefined as T));
    stateByKey.set(key, created as Ref<unknown>);

    return created;
}

/**
 * Сбрасывает состояния `useState` — вызывается тестами между кейсами, чтобы
 * снимок одного не доезжал до другого.
 */
export function resetNuxtStateStub(): void {
    stateByKey.clear();
    nuxtApp = {};
}

/**
 * Стаб useNuxtApp: один экземпляр на «жизнь приложения», без `$i18n` — переводы
 * в сторах падают обратно на ключ. Сбрасывается вместе с состояниями.
 */
export function useNuxtApp(): Record<string, unknown> {
    return nuxtApp;
}

/**
 * Стаб useCookie: пустое значение.
 */
export function useCookie(): { value: unknown } {
    return { value: null };
}

/**
 * Стаб useRequestEvent: вне SSR-контекста события нет.
 */
export function useRequestEvent(): undefined {
    return undefined;
}

/**
 * Стаб useRuntimeConfig: пустая публичная конфигурация.
 */
export function useRuntimeConfig(): { public: Record<string, unknown> } {
    return { public: {} };
}

/**
 * Стаб useRouter: отвечает на вопрос «кто выигрывает путь» по таблице
 * дефолтных маршрутов модуля. Дефолт неслучаен — проверки доступности адреса
 * иначе пришлось бы настраивать в каждом тесте, а поведение «как в приложении»
 * и есть то, что они проверяют. Параметрические маршруты эмулируются так же,
 * как их ранжирует vue-router: статический сосед бьёт параметр.
 */
export function useRouter(): {
    hasRoute: (name: string) => boolean;
    resolve: (path: string) => { matched: Array<{ name: string }> };
} {
    const staticRoutes: Record<string, string> = {
        '/bricks': 'bricks-builder-index',
        '/bricks/bricks-login': 'bricks-builder-login',
    };

    return {
        hasRoute: (name: string) =>
            ['bricks-page', 'bricks-page-prefixed', 'bricks-builder-pagename'].includes(name),
        resolve: (path: string) => {
            const staticOwner = staticRoutes[path];
            if (staticOwner) {
                return { matched: [{ name: staticOwner }] };
            }

            if (path.startsWith('/bricks/')) {
                return { matched: [{ name: 'bricks-builder-pagename' }] };
            }

            if (path.startsWith('/bricks-preview/')) {
                return { matched: [{ name: 'bricks-preview' }] };
            }

            return {
                matched: [
                    { name: path.slice(1).includes('/') ? 'bricks-page-prefixed' : 'bricks-page' },
                ],
            };
        },
    };
}

/**
 * Стаб onNuxtReady: колбэки не исполняются сразу, а складываются — тест дёргает
 * их сам через `runNuxtReadyCallbacks`. В приложении Nuxt откладывает их до конца
 * гидрации, и «отложенность» здесь существенна: код, вызвавший запрос раньше
 * времени, обязан отличаться от кода, дождавшегося готовности.
 *
 * @param callback - Колбэк готовности приложения.
 */
export function onNuxtReady(callback: () => unknown): void {
    nuxtReadyCallbacks.push(callback);
}

/**
 * Исполняет отложенные колбэки `onNuxtReady`. Очередь сохраняется: повторный
 * вызов проверяет, что восстановление уходит ровно однажды и не зависит от того,
 * сколько раз его позвали.
 */
export function runNuxtReadyCallbacks(): void {
    [...nuxtReadyCallbacks].forEach((callback) => callback());
}

/**
 * Сбрасывает очередь колбэков `onNuxtReady` между кейсами.
 */
export function resetNuxtReadyStub(): void {
    nuxtReadyCallbacks.length = 0;
}
