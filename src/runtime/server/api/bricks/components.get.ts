import { createError, defineEventHandler, getQuery } from 'h3';
import { resolveBricksComponents } from '../../utils/bricksComponents';

/**
 * GET /api/bricks/components — returns the whole manifest, or the components of
 * the chosen category. Open for reading without auth (see routeProtection.ts): it
 * serves the contents of the library — names, categories, brick file paths and
 * their editorial metadata, that is exactly what goes into the client bundle
 * anyway.
 */
export default defineEventHandler(async (event) => {
    const { category } = getQuery(event);

    // A repeated ?category=a&category=b arrives as an array — that is a client
    // error, not a request for the whole manifest
    if (category !== undefined && typeof category !== 'string') {
        throw createError({
            statusCode: 400,
            message: 'category must be a single value',
        });
    }

    return await resolveBricksComponents(category || undefined);
});
