import type { LandingComponent, LandingSchema, ILandingSchemaMeta } from '../../common/types/landing';
import { cloneLandingComponent } from '../../common/utils/landing/components';
import { normalizeDeviceVisibility } from '../../common/utils/landing/deviceVisibility';
import { normalizeStoryPath } from '../../common/utils/landing/paths';

/**
 * Ограничивает размер истории и позицию индекса.
 *
 * @param history - Массив сохранённых схем.
 * @param historyIndex - Текущий индекс истории.
 * @param limit - Максимальное количество записей.
 * @returns Обновлённые { history, historyIndex }.
 */
export function clampHistory(
    history: LandingSchema[],
    historyIndex: number,
    limit: number = 50
): { history: LandingSchema[]; historyIndex: number } {
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
 * Сериализует массив компонентов в LandingSchema.
 *
 * @param components - Компоненты Canvas.
 * @param meta - Опциональные метаданные схемы (навигация и др.).
 * @returns LandingSchema с нормализованными путями.
 */
export function serializeSchema(
    components: LandingComponent[],
    meta?: ILandingSchemaMeta
): LandingSchema {
    const schema: LandingSchema = {
        components: components.map((component) => {
            const cloned = cloneLandingComponent(component);
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
export function deserializeSchema(schema: LandingSchema): LandingComponent[] {
    return (schema.components || []).map((component) => {
        const cloned = cloneLandingComponent({
            ...component,
            storyPath: normalizeStoryPath(component.storyPath),
        });
        cloned.deviceVisibility = normalizeDeviceVisibility(component.deviceVisibility);
        return cloned;
    });
}
