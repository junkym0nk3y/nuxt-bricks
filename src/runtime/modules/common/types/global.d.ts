import 'vue';

declare global {
    function useAsyncData<T = any>(
        key: string,
        handler: () => Promise<T> | T
    ): Promise<{ data: { value: T | null } }>;
    function useRoute(): any;
    function useHead(input: any): void;
    function defineNuxtConfig(config: any): any;
    function appendHeader(...args: any[]): void;
    function createError(input: any): Error;
    function $fetch<T = any>(input: any, init?: any): Promise<T>;
    const useNuxtApp: () => any;

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
        $device?: Record<string, any>;
    }
}

declare module '#imports' {
    export const useNuxtApp: () => any;
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
