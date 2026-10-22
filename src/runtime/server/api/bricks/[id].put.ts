import { defineEventHandler } from 'h3';
import { updatePageFromEvent } from '../../../modules/persistence/server/utils/pageUpdate';

/**
 * PUT /api/bricks/:id — updates the fields of a page by id.
 */
export default defineEventHandler(async (event) => {
    return updatePageFromEvent(event);
});
