import './external.d.ts';
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

    interface ImportMeta {
        glob<T = unknown>(
            pattern: string | string[],
            options?: { eager?: boolean }
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
}

export {};
