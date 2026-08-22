import type { TBrickManifestRef } from '../../../common/types/brickManifest';

/**
 * Key of a modal window (the component name)
 */
export type TModalKey = string;

/**
 * Option of the modal picker
 */
export interface IModalOption {
    label: string;
    value: TModalKey | null;
}

/**
 * Cached modal: the name and the brick-file path taken from the manifest of
 * brick components. The cache needs no category, it is always `Modal` there
 */
export type TCachedModal = TBrickManifestRef;
