import { defineEventHandler } from 'h3';
import { updatePageFromEvent } from '../../../modules/persistence/server/utils/pageUpdate';

/**
 * PUT /api/bricks/:id — обновляет поля страницы по id.
 */
export default defineEventHandler(async (event) => {
    return updatePageFromEvent(event);
});
