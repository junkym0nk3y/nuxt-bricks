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
}

export {};
