import type {
    IBricksComponent,
    IBricksSchema,
    IBricksSchemaMeta,
} from '../../../common/types/brick';
import { cloneBricksComponent } from '../../../common/utils/bricks/components';
import { normalizeDeviceVisibility } from '../../../common/utils/bricks/deviceVisibility';
import { normalizeBrickPath } from '../../../common/utils/bricks/paths';

/**
 * Caps the size of the history and the position of the index.
 *
 * @param history - Stored schemas.
 * @param historyIndex - Current history index.
 * @param limit - Highest number of entries kept.
 * @returns Updated { history, historyIndex }.
 */
export function clampHistory(
    history: IBricksSchema[],
    historyIndex: number,
    limit: number = 50
): { history: IBricksSchema[]; historyIndex: number } {
    const result = [...history];
    let index = historyIndex;

    if (result.length > limit) {
        const extra = result.length - limit;
        result.splice(0, extra);
        index = Math.max(0, index - extra);
    }

    return { history: result, historyIndex: index };
}

/**
 * Serializes an array of components into an IBricksSchema.
 *
 * @param components - Canvas components.
 * @param meta - Optional schema metadata (navigation and the like).
 * @returns IBricksSchema with normalized paths.
 */
export function serializeSchema(
    components: IBricksComponent[],
    meta?: IBricksSchemaMeta
): IBricksSchema {
    const schema: IBricksSchema = {
        components: components.map((component) => {
            const cloned = cloneBricksComponent(component);
            cloned.brickPath = normalizeBrickPath(component.brickPath);
            return cloned;
        }),
    };

    if (meta && Object.keys(meta).length > 0) {
        schema.meta = meta;
    }

    return schema;
}

/**
 * Restores the components out of a stored schema.
 *
 * @param schema - Stored schema.
 * @returns Components with normalized paths.
 */
export function deserializeSchema(schema: IBricksSchema): IBricksComponent[] {
    return (schema.components || []).map((component) => {
        const cloned = cloneBricksComponent({
            ...component,
            brickPath: normalizeBrickPath(component.brickPath),
        });
        cloned.deviceVisibility = normalizeDeviceVisibility(component.deviceVisibility);
        return cloned;
    });
}
