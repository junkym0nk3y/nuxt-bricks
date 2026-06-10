// TODO(persistence, Шаг 6): переедет в runtime/persistence/ при введении StorageAdapter/PublishAdapter
import { createError } from 'h3';
import { getLandingCategoriesFromJson } from '../../../utils/routing/landings-api';
import type { INuxtLandRoute } from '../../../utils/routing/types.d.ts';

/**
 * Возвращает список компонентов по категории или весь словарь категорий.
 * Бросает 404, если категория не найдена в сгенерированном bricks.json.
 * @param category Название категории из запроса.
 */
export function resolveLandingComponents(category?: string) {
    if (!category) {
        return getLandingCategoriesFromJson(true);
    }

    const allRoutes = getLandingCategoriesFromJson();
    const match = Object.keys(allRoutes).find(
        (key) => key.toLowerCase() === category.toLowerCase()
    );

    if (!match) {
        throw createError({
            statusMessage: 'Components category not found!',
            statusCode: 404,
            data: {
                description: 'Please make sure that /public/bricks.json is correct!',
            },
        });
    }

    if (typeof allRoutes === 'object' && !Array.isArray(allRoutes)) {
        return (allRoutes as Record<string, INuxtLandRoute>)[match]?.components;
    }

    return [];
}
