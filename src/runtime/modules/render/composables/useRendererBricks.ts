import { defineAsyncComponent, type Component } from 'vue';
import type { IRendererBrickResolverOptions } from '../types/render';
import { normalizeBrickPath, toBrickManifestKey } from '../../common/utils/bricks/paths';

/**
 * Resolved brick components by normalized path. Only successes get in: the map lives at
 * module scope, that is, on the server it outlives a request, and a remembered failure
 * would answer for the whole life of the process.
 */
const componentCache = new Map<string, Component>();

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

        // Only a real component is remembered. A module without a usable export was
        // cached as null before, and this cache lives at module scope — on the server it
        // outlives the request, so one build without the export kept answering "no
        // component" to every later request of the process, including one served after
        // the file was fixed
        if (component) {
            componentCache.set(cacheKey, component);
        }

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
export function useRendererBricks({
    findImportModule,
    registerSsrModule,
}: IRendererBrickResolverOptions) {
    /**
     * Returns the Vue component for a `brickPath` using a dynamic import.
     *
     * Every component handed out is registered with the SSR response by the key of its
     * brick file. The SFC registers its own `.vue` id, but the client manifest keys the
     * chunk by the brick file — the target of the dynamic import — so without this the
     * response linked none of the stylesheets of a brick or of its children, and a
     * published page rendered unstyled until the hydration. The registration runs on
     * every call, the cache hits included: the cache outlives a request on the server,
     * the response does not.
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
        const cached = componentCache.get(cacheKey);

        if (cached) {
            registerSsrModule?.(toBrickManifestKey(cacheKey));
            return cached;
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
                try {
                    const component = await loadBrickComponent(brickPath, importModule);

                    if (!component) {
                        throw new Error(`Module ${brickPath} has no usable component export`);
                    }

                    return component;
                } catch (error) {
                    // The wrapper leaves the cache together with the failure. Vue keeps the
                    // rejected request inside the wrapper and never calls the loader a second
                    // time, so a cached wrapper answered "no component" for as long as it
                    // lived — and this cache lives at module scope, that is, across requests
                    // on the server. Not caching the failure inside `loadBrickComponent` is
                    // not enough on its own for exactly that reason
                    componentCache.delete(cacheKey);

                    throw error;
                }
            },
            suspensible: true,
        });

        // The key is normalized, as in the read above: with a raw path the entry
        // was never found, and every repaint created a new async wrapper
        componentCache.set(cacheKey, asyncComponent);
        registerSsrModule?.(toBrickManifestKey(cacheKey));
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
