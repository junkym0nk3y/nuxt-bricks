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
}

/**
 * Стаб useNuxtApp: без `$i18n` — переводы в сторах падают обратно на ключ.
 */
export function useNuxtApp(): Record<string, unknown> {
    return {};
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
