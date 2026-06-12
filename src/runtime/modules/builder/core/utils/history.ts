import type {
    IBricksComponent,
    IBricksSchema,
    IBricksSchemaMeta,
} from '../../../common/types/brick';
import { cloneBricksComponent } from '../../../common/utils/bricks/components';
import { normalizeDeviceVisibility } from '../../../common/utils/bricks/deviceVisibility';
import { normalizeStoryPath } from '../../../common/utils/bricks/paths';

/**
 * Ограничивает размер истории и позицию индекса.
 *
 * @param history - Массив сохранённых схем.
 * @param historyIndex - Текущий индекс истории.
 * @param limit - Максимальное количество записей.
 * @returns Обновлённые { history, historyIndex }.
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
 * Сериализует массив компонентов в IBricksSchema.
 *
 * @param components - Компоненты Canvas.
 * @param meta - Опциональные метаданные схемы (навигация и др.).
 * @returns IBricksSchema с нормализованными путями.
 */
export function serializeSchema(
    components: IBricksComponent[],
    meta?: IBricksSchemaMeta
): IBricksSchema {
    const schema: IBricksSchema = {
        components: components.map((component) => {
            const cloned = cloneBricksComponent(component);
            cloned.storyPath = normalizeStoryPath(component.storyPath);
            return cloned;
        }),
    };

    if (meta && Object.keys(meta).length > 0) {
        schema.meta = meta;
    }

    return schema;
}

/**
 * Восстанавливает компоненты из сохранённой схемы.
 *
 * @param schema - Сохранённая схема.
 * @returns Компоненты с нормализованными путями.
 */
export function deserializeSchema(schema: IBricksSchema): IBricksComponent[] {
    return (schema.components || []).map((component) => {
        const cloned = cloneBricksComponent({
            ...component,
            storyPath: normalizeStoryPath(component.storyPath),
        });
        cloned.deviceVisibility = normalizeDeviceVisibility(component.deviceVisibility);
        return cloned;
    });
}
