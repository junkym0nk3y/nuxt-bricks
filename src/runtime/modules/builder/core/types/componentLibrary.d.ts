/**
 * Types of the component library, shared by the code that builds the list
 * (`builder/app`) and the code that shows it (`builder/shell`). They live in the
 * core because shell is not allowed to import from the composition root.
 */
import type { IBricksComponent, IPropertyDefinition } from '../../../common/types/brick';
import type { IBrickManifestEntry } from '../../../common/types/brickManifest';

/**
 * A brick from the manifest that did not make it into the library: the entry is
 * there, but the build carries no loader for its `brickPath`. This is the manifest
 * and `import.meta.glob` out of sync: the loader map is expanded at transform time,
 * so nothing fixes it at runtime — in dev a server restart helps, in production it
 * is a build defect.
 */
export interface ISkippedBrick {
    name: string;
    brickPath: string;
}

/**
 * Brick metadata keyed by `brickPath`. Built from the response of the components
 * endpoint, it is the single source of editor data: the properties panel, the slots,
 * inline editing and force-render read it instead of importing the brick module.
 */
export type TBrickMetadataIndex = Record<string, IBrickManifestEntry>;

/** Return value of `useBrickMetadata` */
export interface IUseBrickMetadataReturn {
    /**
     * Replaces the index as a whole. Replaces, not appends: a manifest that arrived
     * successfully has to drop the entries of bricks that no longer exist.
     */
    replaceBrickMetadata: (entries: IBrickManifestEntry[]) => void;
    /**
     * Metadata of a brick, or `undefined` when the manifest has not arrived yet or
     * carries no such entry.
     */
    readBrickMetadata: (brickPath: string) => IBrickManifestEntry | undefined;
}

/** Component data the properties panel needs */
export interface IComponentEditorMetadata {
    /** Definitions of the editable properties; empty while there is no metadata */
    properties: IPropertyDefinition[];
    /** Description of the component */
    description?: string;
}

/** Return value of `useComponentEditorMetadata` */
export interface IUseComponentEditorMetadataReturn {
    /**
     * Collects the properties-panel data of a canvas component: for a layout block
     * out of its definition, for a brick component out of the metadata index.
     */
    resolveComponentEditorMetadata: (component: IBricksComponent) => IComponentEditorMetadata;
}
