/**
 * Contracts of the build-time setup helpers (`src/module-setup.ts`): the active
 * module surfaces and the context for registering file-backed entities.
 */
import type { Resolver } from '@nuxt/kit';
import type { IBricksRoutePrefixes } from '../runtime/modules/common/utils/bricks/routePaths';

/** Active module surfaces: route prefixes plus feature flags */
export interface IBricksSurfaces {
    /** Validated builder and preview prefixes */
    routePrefixes: IBricksRoutePrefixes;
    /** Builder UI is on (pages, editor plugins, editorial API, i18n, Pinia) */
    isBuilderEnabled: boolean;
    /** The live-render catch-all routes are on */
    arePublishedPagesEnabled: boolean;
}

/** Context for registering file-backed entities (pages, handlers) */
export interface IBricksRegistrationContext {
    /** Module resolver (createResolver(import.meta.url).resolve) */
    resolve: Resolver['resolve'];
    /** Absolute path of src/runtime */
    runtimeDir: string;
    /** Active surfaces */
    surfaces: IBricksSurfaces;
}
