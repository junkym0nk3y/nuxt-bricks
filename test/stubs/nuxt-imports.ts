/**
 * Минимальный стаб `#imports` для unit-тестов (подключается через
 * `resolve.alias` в vitest.config.ts). Покрывает только то, что реально
 * дёргается в тестируемых модулях вне Nuxt-контекста.
 */

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
