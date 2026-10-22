import type { IBrickExportModule } from '../types/index';
import type { IUseBrickImportsReturn } from '../types/composables';
import { normalizeBrickPath } from '../utils/bricks/paths';
import { readOwnKey } from '../utils/safeRecord';

/**
 * Loaders of the brick files of the consumer project.
 *
 * The pattern is root-absolute, so Vite resolves it from its own root
 * (`nuxt.options.srcDir`), and the keys always look like
 * `/components/<path>.brick.ts`: in Nuxt 3 srcDir equals rootDir, in Nuxt 4 it is
 * `<rootDir>/app`, and in the playground it is `<repo>/playground`. The build-time
 * generator (`src/bricks-manifest.ts`) writes `brickPath` in exactly that shape,
 * so finding a loader is a direct lookup.
 *
 * It relies on the standard `vite.root === srcDir`: with an overridden root the
 * keys of this map and the paths of the generator diverge. Additional component
 * directories (`components.dirs`, Nuxt layers, other modules, npm packages) do
 * not get here — the supported scope is listed in the README.
 */
const brickModules = import.meta.glob<IBrickExportModule>('/components/**/*.brick.ts');

/** Layout blocks are built into the module and have no brick files */
const LAYOUT_BRICK_PREFIX = 'layout';

/**
 * Paths whose miss has already been reported, in their normalized shape.
 *
 * Once per path for the lifetime of this module: a loader cannot be added to a
 * finished map — `import.meta.glob` is expanded at the transformation stage — so
 * reporting the same path again carries no new occasion. The loading itself is
 * still retried as before: only the log is deduplicated.
 *
 * The price: on SSR the state lives between requests, and a second request for the
 * same broken path stays silent. The trade-off is deliberate — otherwise a bot
 * crawling a page with an outdated component would flood the server log with one
 * and the same defect. In dev the contents of the map are rebuilt by a restart,
 * which reloads this module too.
 */
const reportedMissingBrickPaths = new Set<string>();

/** Contents of the loader map: they do not change without a rebuild, so they are computed once */
let availableBrickPaths: string[] | null = null;

/**
 * Reports the first miss for a path.
 *
 * Serializing the whole contents of the map on every miss was expensive: a
 * published page with several outdated components printed the entire component
 * library once per loading attempt, both on SSR and on the client. What goes out is
 * the requested path and the size of the map; the full list only in dev.
 *
 * At the `warn` level rather than `error`: the page stays operable, the component
 * simply does not render. `error` is reserved for failures of the import itself and
 * for a corrupted export.
 *
 * @param brickPath - The `brickPath` value from the schema or the manifest.
 */
function reportMissingBrick(brickPath: string): void {
    const normalizedPath = normalizeBrickPath(brickPath);

    if (reportedMissingBrickPaths.has(normalizedPath)) {
        return;
    }

    reportedMissingBrickPaths.add(normalizedPath);

    const modulePaths = (availableBrickPaths ??= Object.keys(brickModules));

    console.warn('[useBrickImports] Brick module is absent from the transformed import map', {
        // The original path rather than the normalized one: whoever diagnoses this
        // needs what is written in the schema
        brickPath,
        availableBrickModuleCount: modulePaths.length,
        ...(import.meta.dev ? { availableBrickPaths: modulePaths } : {}),
    });
}

/**
 * Looks up the loader of a brick module without side effects.
 *
 * `brickPath` comes from a page schema or from the manifest, so the lookup goes by
 * an own key only: otherwise `"__proto__"` would return `Object.prototype` and
 * `"constructor"` the `Object` function, and both would go out as a "loader".
 *
 * @param brickPath - The `brickPath` value from the schema or the manifest.
 * @returns The Vite loader function, or `undefined` if there is no such file.
 */
function resolveBrickLoader(brickPath: string): (() => Promise<IBrickExportModule>) | undefined {
    if (brickPath.startsWith(LAYOUT_BRICK_PREFIX)) {
        return undefined;
    }

    return readOwnKey(brickModules, normalizeBrickPath(brickPath));
}

/**
 * Gives access to the dynamic imports of the consumer's `.brick.ts` files.
 *
 * @returns The functions that look a loader up and check whether it exists.
 */
export function useBrickImports(): IUseBrickImportsReturn {
    /**
     * Returns the loader of a brick module by the path from the component schema.
     *
     * @param brickPath - The `brickPath` value stored in the schema.
     * @returns The Vite loader function, or `undefined` if there is no such file.
     */
    function findImportModule(brickPath: string): (() => Promise<IBrickExportModule>) | undefined {
        const importModule = resolveBrickLoader(brickPath);

        if (!importModule && !brickPath.startsWith(LAYOUT_BRICK_PREFIX)) {
            reportMissingBrick(brickPath);
        }

        return importModule;
    }

    /**
     * Whether the build has a loader for this `brickPath`.
     *
     * Separate from `findImportModule` because it is called from computed
     * properties on every redraw of the library: a miss report there would repeat
     * with no new occasion, while the absence of a loader is shown by the sidebar
     * itself.
     *
     * @param brickPath - The `brickPath` value from the manifest.
     * @returns Whether a loader exists.
     */
    function hasBrickModule(brickPath: string): boolean {
        return resolveBrickLoader(brickPath) !== undefined;
    }

    return {
        findImportModule,
        hasBrickModule,
    };
}
