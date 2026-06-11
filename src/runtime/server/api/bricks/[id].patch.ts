import { defineEventHandler } from 'h3';
import { updatePageFromEvent } from '../../../modules/persistence/server/utils/pageUpdate';

/**
 * PATCH /api/bricks/:id — частично обновляет поля страницы по id.
 */
export default defineEventHandler(async (event) => {
    return updatePageFromEvent(event);
});
