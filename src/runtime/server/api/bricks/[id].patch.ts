import { defineEventHandler } from 'h3';
import { updatePageFromEvent } from '../../../modules/persistence/server/utils/pageUpdate';

/**
 * PATCH /api/bricks/:id — partially updates the fields of a page by id.
 */
export default defineEventHandler(async (event) => {
    return updatePageFromEvent(event);
});
