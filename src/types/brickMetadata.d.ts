/**
 * Types of the build-time brick metadata parser (`src/brick-metadata.ts`).
 * The shapes that travel into the manifest (`IBrickValues`,
 * `IComponentSlotDefinition`) are shared with the runtime; the language of
 * allowed values lives in `brickLiterals.d.ts`.
 */
import type { IComponentSlotDefinition } from '../runtime/modules/common/types/brick';
import type { IBrickValues } from '../runtime/modules/common/types/index';

/** Metadata of one brick file, extracted from its source */
export interface IBrickMetadata {
    /** Library category; the default one when the field is absent */
    category: string;
    /** Description for the properties panel */
    description?: string;
    /** Definitions of the editable properties: prop name → value description */
    values: Record<string, IBrickValues>;
    /** Normalized slot definitions; absent when the brick has no slots */
    slots?: IComponentSlotDefinition[];
}
