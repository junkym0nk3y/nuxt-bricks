import { appendHeader, defineEventHandler } from 'h3';
import { resolveBricksComponents } from '../../utils/bricksComponents';

/**
 * GET /mock-api/bricks-components — возвращает весь список категорий или компоненты выбранной
 категории.
 */
export default defineEventHandler(async (event) => {
    appendHeader(event, 'Access-Control-Allow-Origin', '*');
    const url = new URL(event.node.req.url || '', 'http://localhost');
    const category = url.searchParams.get('category');

    return resolveBricksComponents(category || undefined);
});
