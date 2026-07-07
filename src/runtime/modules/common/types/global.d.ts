import 'vue';
import type { RouteLocationNormalizedLoaded } from 'vue-router';

/**
 * Минимальный шим NuxtApp для module-окружения: payload типизирован,
 * инжекты плагинов (`$i18n` и т.п.) доступны через открытый словарь.
 */
interface INuxtAppShim {
    payload: { data: Record<string, unknown> };
    [key: string]: unknown;
}

declare global {
    function useAsyncData<T = unknown>(
        key: string,
        handler: () => Promise<T> | T
    ): Promise<{ data: { value: T | null } }>;
    function useRoute(): RouteLocationNormalizedLoaded;
    function useHead(input: Record<string, unknown>): void;
    function defineNuxtConfig(config: Record<string, unknown>): Record<string, unknown>;
    function appendHeader(...args: unknown[]): void;
    function createError(input: string | Record<string, unknown>): Error;
    function $fetch<T = unknown>(input: string | URL, init?: Record<string, unknown>): Promise<T>;
    const useNuxtApp: () => INuxtAppShim;

    interface IImportGlobOptions {
        import?: string;
        query?: string | Record<string, string | number | boolean>;
    }

    interface ImportMeta {
        glob<T = unknown>(
            pattern: string | string[],
            options: IImportGlobOptions & { eager: true }
        ): Record<string, T>;
        glob<T = unknown>(
            pattern: string | string[],
            options?: IImportGlobOptions & { eager?: false }
        ): Record<string, () => Promise<T>>;
    }
}

declare module 'vue' {
    interface ComponentCustomProperties {
        $device?: Record<string, unknown>;
    }
}

declare module '#imports' {
    export const useNuxtApp: () => INuxtAppShim;
    /**
     * Compiler macro страниц Nuxt. В module-окружении (`nuxt-module-build prepare`)
     * pages-модуль не активен и тип не генерируется — шим повторяет сигнатуру
     * `nuxt/dist/pages/runtime/composables`.
     */
    export const definePageMeta: (meta: Record<string, unknown>) => void;
}

/**
 * В приложении-потребителе `NuxtLayouts`/`LayoutKey` генерируются в
 * `.nuxt/types/layouts.d.ts` из реальных layout'ов. Runtime модуля
 * компилируется без этой генерации, поэтому шим объявляет открытый словарь —
 * имена layout'ов потребителя заранее неизвестны.
 */
declare module 'nuxt/app' {
    interface NuxtLayouts {
        [name: string]: Record<string, unknown>;
    }
    export type LayoutKey = keyof NuxtLayouts;
}

/**
 * `@nuxtjs/i18n` добавляет `setLocale` в Composer через генерируемую
 * аугментацию `ComposerCustom` — в module-окружении её нет, шимим вручную.
 */
declare module 'vue-i18n' {
    interface ComposerCustom {
        setLocale: (locale: string) => Promise<void>;
    }
}

export {};
