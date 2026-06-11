import { createError } from 'h3';
import { getBricksCategoriesFromJson } from '../../modules/common/utils/routing/bricks-api';
import type { IBrickRoute } from '../../modules/common/utils/routing/types.d.ts';

/**
 * Возвращает список компонентов по категории или весь словарь категорий.
 * Бросает 404, если категория не найдена в сгенерированном bricks.json.
 * @param category Название категории из запроса.
 */
export function resolveBricksComponents(category?: string) {
    if (!category) {
        return getBricksCategoriesFromJson(true);
    }

    const allRoutes = getBricksCategoriesFromJson();
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
        return (allRoutes as Record<string, IBrickRoute>)[match]?.components;
    }

    return [];
}
