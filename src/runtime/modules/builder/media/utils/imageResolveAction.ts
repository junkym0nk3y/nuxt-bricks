// Types
import type { TImageResolveAction } from '../types/schemaImageResolver';

/** Every action the resolver knows, in the order the pickers show them */
export const IMAGE_RESOLVE_ACTIONS: TImageResolveAction[] = ['keep', 'placeholder'];

/**
 * Narrows a value that came out of a picker down to an action of the resolver.
 *
 * The check is a real one rather than a cast: `BricksSelect` hands out the wide
 * `TBrickDemoValues | null` of the kit, and a cast would have let any string through
 * into the schema — where an unknown action means an image left untouched with no one
 * the wiser.
 *
 * @param value - Whatever the picker reported.
 */
export function isImageResolveAction(value: unknown): value is TImageResolveAction {
    return IMAGE_RESOLVE_ACTIONS.includes(value as TImageResolveAction);
}
