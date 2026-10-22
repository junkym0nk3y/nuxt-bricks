// Utils
import {
    DEFAULT_BRICKS_ROUTE_PREFIXES,
    isBuilderPath,
    isProtectedBricksHtmlPath,
    stripPathBase,
    type IBricksRoutePrefixes,
} from '../../modules/common/utils/bricks/routePaths';

// Nuxt
import { useRequestURL, useRouter, useRuntimeConfig } from '#imports';

/**
 * Runs `install` once, on the first hit of a builder route
 * (`bricks.routes.builderPrefix`, `/bricks` by default): either on the initial
 * load (SSR and client alike — before the render/hydration, which is why the call
 * has to be awaited from the body of an async plugin) or in `beforeResolve` on an
 * SPA transition from a published page. The heavy part of the plugin stays in a
 * lazy chunk behind `import()` and never enters the bundle of published pages.
 *
 * @param install - Asynchronous installation of the heavy part of the plugin.
 */
export async function runOnBuilderRoute(install: () => Promise<void>): Promise<void> {
    await runOnBricksRoute(install, isBuilderPath);
}

/**
 * The same for the builder AND preview surfaces.
 *
 * Needed by the chunks that show up on both: the device set is edited in the
 * builder, but the glyph of the chosen device is shown by the preview banner too,
 * and the preview route sits behind `previewPrefix`, out of reach of
 * `runOnBuilderRoute`.
 *
 * @param install - Asynchronous installation of the heavy part of the plugin.
 */
export async function runOnBricksSurface(install: () => Promise<void>): Promise<void> {
    await runOnBricksRoute(install, isProtectedBricksHtmlPath);
}

/**
 * The shared mechanics of a one-time installation behind a path predicate.
 *
 * @param install - Asynchronous installation.
 * @param matches - The "this path is served" predicate.
 */
async function runOnBricksRoute(
    install: () => Promise<void>,
    matches: (prefixes: IBricksRoutePrefixes, pathname: string) => boolean
): Promise<void> {
    const router = useRouter();
    const config = useRuntimeConfig();
    const prefixes =
        (config.public.bricksRoutes as IBricksRoutePrefixes | undefined) ??
        DEFAULT_BRICKS_ROUTE_PREFIXES;

    // The installation itself rather than a "done" flag. A flag raised before the
    // await turned a single failed `import()` (a chunk lost to a deploy, a broken
    // network) into a permanently half-installed builder: the next navigation saw
    // the flag and returned at once, so the toolbar provider, the validation rules
    // or the builder icon set never arrived and nothing was reported. Keeping the
    // promise also serializes the parallel callers — `beforeResolve` and the initial
    // URL both reach here, and a flag made the second one continue before the first
    // installation had finished.
    let installation: Promise<void> | null = null;

    /**
     * Runs install once, if the path is one the predicate serves. A refused
     * installation is forgotten, so the next navigation onto a served route tries
     * again; the refusal itself still reaches the caller.
     */
    async function ensureInstalled(path: string): Promise<void> {
        if (!matches(prefixes, path)) {
            return;
        }

        if (installation === null) {
            const attempt = install();

            installation = attempt;
            attempt.catch(() => {
                // The identity check keeps a late refusal from wiping a retry that
                // has already started under the same latch
                if (installation === attempt) {
                    installation = null;
                }
            });
        }

        await installation;
    }

    // An SPA transition onto a served surface from a published page; install is
    // awaited before the render
    router.beforeResolve(async (to) => {
        await ensureInstalled(to.path);
    });

    // The initial URL of the request (`router.currentRoute` is still a placeholder at
    // plugin time); the actual pathname carries app.baseURL — stripped down to the
    // logical path. The await holds up the bootstrap on the served routes alone —
    // published pages are not delayed.
    const baseURL = (config.app?.baseURL as string | undefined) || '/';
    await ensureInstalled(stripPathBase(useRequestURL().pathname, baseURL));
}
