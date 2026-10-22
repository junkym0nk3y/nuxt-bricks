import 'vue';
import type { RouteLocationNormalizedLoaded } from 'vue-router';

/**
 * A minimal NuxtApp shim for the module environment: the payload is typed, while the
 * plugin injections (`$i18n` and the like) are available through an open dictionary.
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
     * The compiler macro of Nuxt pages. In the module environment
     * (`nuxt-module-build prepare`) the pages module is not active and the type is not
     * generated — the shim repeats the signature of
     * `nuxt/dist/pages/runtime/composables`.
     */
    export const definePageMeta: (meta: Record<string, unknown>) => void;
}

/**
 * In a consumer application `NuxtLayouts`/`LayoutKey` are generated into
 * `.nuxt/types/layouts.d.ts` out of the real layouts. The runtime of the module is
 * compiled without that generation, so the shim declares an open dictionary — the
 * names of the consumer's layouts are not known in advance.
 */
declare module 'nuxt/app' {
    interface NuxtLayouts {
        [name: string]: Record<string, unknown>;
    }
    export type LayoutKey = keyof NuxtLayouts;
}

/**
 * `@nuxtjs/i18n` adds its members to the Composer through a generated `ComposerCustom`
 * augmentation — in the module environment there is none, so the ones the package
 * uses are shimmed by hand.
 */
declare module 'vue-i18n' {
    interface ComposerCustom {
        setLocale: (locale: string) => Promise<void>;
    }
}

export {};
