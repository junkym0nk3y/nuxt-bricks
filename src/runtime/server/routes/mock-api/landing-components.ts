import { appendHeader, defineEventHandler } from 'h3';
import { resolveLandingComponents } from '../../../utils/db/landing-components';

/**
 * GET /mock-api/landing-components — возвращает весь список категорий или компоненты выбранной
 категории.
 */
export default defineEventHandler(async (event) => {
    appendHeader(event, 'Access-Control-Allow-Origin', '*');
    const url = new URL(event.node.req.url || '', 'http://localhost');
    const category = url.searchParams.get('category');

    return resolveLandingComponents(category || undefined);
});
