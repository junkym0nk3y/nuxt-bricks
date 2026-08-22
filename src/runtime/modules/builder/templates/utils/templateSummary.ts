/**
 * Bringing the whole row of a template down to the summary the list holds.
 *
 * Needed because the write endpoints (POST/PATCH) answer with the template IN FULL —
 * with its schema and its styling — while the list holds summaries: putting the whole
 * row in there would mean keeping a schema in the state of the application for the
 * sake of one card, and drifting in shape from what the next read brings.
 *
 * The number of blocks is counted here rather than taken from the answer: the whole row
 * does not carry it (the summary that does is assembled by SQL), but it does carry the
 * schema itself — the source of that same number.
 */
import type { IBricksTemplateRow, TBricksTemplateSummary } from '../../../common/types/templates';

/**
 * Assembles the summary of a template out of its whole row.
 *
 * @param template - The whole row of the template, as a write endpoint answered it.
 * @returns The summary for the list of the section.
 */
export function toTemplateSummary(template: IBricksTemplateRow): TBricksTemplateSummary {
    return {
        id: template.id,
        name: template.name,
        description: template.description,
        thumbnailUrl: template.thumbnailUrl,
        blocksCount: template.schema?.components?.length ?? 0,
        createdAt: template.createdAt,
        updatedAt: template.updatedAt,
    };
}
