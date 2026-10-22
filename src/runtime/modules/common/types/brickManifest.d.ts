/**
 * Contract of the brick component manifest: the build-time scan of `*.brick.ts`
 * writes it into buildDir, and the `GET /api/bricks/components` endpoint hands it to
 * the builder.
 */
import type { IComponentSlotDefinition } from './brick';
import type { IBrickValues } from './index';

/** A manifest entry — one `*.brick.ts` that was found */
export interface IBrickManifestEntry {
    /** Component name: the basename of the file without the `.brick.ts` suffix */
    name: string;
    /** Category taken from `category` inside the brick file */
    category: string;
    /**
     * Loader key: the path of the brick file relative to `srcDir` with a leading
     * `/`. Matches the `import.meta.glob` keys in `useBrickImports`, so finding a
     * component is a direct lookup with no guessing among path variants.
     */
    brickPath: string;
    /** Description of the component for the properties panel */
    description?: string;
    /**
     * Definitions of the editable properties. They reach the manifest at build time,
     * so the library, the properties panel and inline editing need not import the
     * brick module in the browser — and with it the Vue component and its styles the
     * brick pulls in with its own import.
     */
    values: Record<string, IBrickValues>;
    /**
     * Normalized slot definitions. Both notations (a list and an object) are brought
     * to one at build time: there is nobody left to parse the raw variants at
     * runtime.
     */
    slots?: IComponentSlotDefinition[];
}

/** The whole manifest: the entries of every scanned brick */
export interface IBricksManifest {
    bricks: IBrickManifestEntry[];
}

/**
 * The narrow shape of an entry: the component name and the loader key, without the
 * metadata. Entries go out in this shape in the `?category=<name>` response — the
 * category is known there from the request, and a request by category has no use for
 * the editorial metadata.
 */
export type TBrickManifestRef = Pick<IBrickManifestEntry, 'name' | 'brickPath'>;
