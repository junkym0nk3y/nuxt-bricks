import { defineAsyncComponent, type Component } from 'vue';
import type { IRendererBrickResolverOptions } from '../types/render';
import { normalizeBrickPath } from '../../common/utils/bricks/paths';

const componentCache = new Map<string, Component | null>();

/**
 * Extracts the Vue component from a loaded brick module.
 *
 * @param module Brick module with the component.
 * @param brickPath Path to the brick, for error logging.
 * @returns The component, or null.
 */
function extractBrickComponent(module: unknown, brickPath: string): Component | null {
    const exportedComponent = (module as Record<string, unknown>)?.Component;

    if (exportedComponent && typeof exportedComponent === 'object') {
        return exportedComponent as Component;
    }

    const component = (module as Record<string, unknown>)?.component;
    if (component && typeof component === 'object') {
        return component as Component;
    }

    if ((module as Record<string, unknown>)?.default) {
        return (module as Record<string, unknown>).default as Component;
    }

    console.error(`[TheRenderer] Module ${brickPath} has no usable component export`);
    return null;
}

/**
 * Loads a brick module and puts it into the cache.
 *
 * The loader arrives already found: the caller has to check that it exists
 * itself, otherwise a missing module would only be discovered inside the async
 * component, where the exception never reaches the placeholder.
 *
 * @param brickPath Path to the brick file.
 * @param importModule The brick module loader that was found.
 * @returns The component, or null.
 */
async function loadBrickComponent(
    brickPath: string,
    importModule: () => Promise<unknown>
): Promise<Component | null> {
    const cacheKey = normalizeBrickPath(brickPath);

    try {
        const module = await importModule();
        const component = extractBrickComponent(module, brickPath);
        componentCache.set(cacheKey, component);
        return component;
    } catch (error) {
        console.error(`[TheRenderer] Failed to load component for ${brickPath}:`, error);
        // Do NOT cache null on an error — the component may start working after HMR
        return null;
    }
}

/**
 * Wraps the loading of brick components with caching of the results.
 *
 * @param options - Options holding the function that finds a loader by brick path.
 * @returns Utilities for resolving brick components.
 */
export function useRendererBricks({ findImportModule }: IRendererBrickResolverOptions) {
    /**
     * Returns the Vue component for a `brickPath` using a dynamic import.
     *
     * @param brickPath - Path to the `.brick.ts` file.
     * @returns The loaded component, or `null` when it could not be found.
     */
    function resolveBrickComponent(brickPath: string): Component | null {
        if (!brickPath) {
            console.warn('[TheRenderer] Missing brickPath for component');
            return null;
        }

        const cacheKey = normalizeBrickPath(brickPath);

        if (componentCache.has(cacheKey)) {
            return componentCache.get(cacheKey) || null;
        }

        // The loader is checked BEFORE the async component is created: inside the
        // loader a miss turned into an exception, it reached the SSR render and
        // took the whole published page down to a 500 (measured on a prod build),
        // together with the intact components of the schema — that is, one stale
        // brickPath carried away the entire page. A synchronous refusal hands
        // control to the placeholder branch in the renderer. The decision is the
        // same on the server and on the client: the loader map is expanded from
        // one pattern over one set of files, so hydration converges.
        const importModule = findImportModule(brickPath);

        if (!importModule) {
            // The miss is reported by the loader lookup itself, once per path;
            // do NOT cache null — the component may appear after HMR
            return null;
        }

        const asyncComponent = defineAsyncComponent({
            loader: async () => {
                const component = await loadBrickComponent(brickPath, importModule);

                if (!component) {
                    throw new Error(`Module ${brickPath} has no usable component export`);
                }

                return component;
            },
            suspensible: true,
        });

        // The key is normalized, as in the read above: with a raw path the entry
        // was never found, and every repaint created a new async wrapper
        componentCache.set(cacheKey, asyncComponent);
        return asyncComponent;
    }

    /**
     * Prefetches a brick component into the shared cache to avoid a hydration mismatch.
     *
     * @param brickPath - Path to the brick file.
     */
    async function prefetchBrickComponent(brickPath: string): Promise<void> {
        if (!brickPath || brickPath.startsWith('layout')) {
            return;
        }

        const cacheKey = normalizeBrickPath(brickPath);

        if (componentCache.has(cacheKey)) {
            return;
        }

        const importModule = findImportModule(brickPath);

        // Nothing to prefetch: the render will show the placeholder, and the
        // prefetch stays silent
        if (!importModule) {
            return;
        }

        await loadBrickComponent(brickPath, importModule);
    }

    return {
        resolveBrickComponent,
        prefetchBrickComponent,
    };
}
