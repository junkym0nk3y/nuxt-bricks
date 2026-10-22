/**
 * The summary of a template: bringing the whole row down to what the list holds, and
 * the meta line both surfaces caption a template with.
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
import { formatPageDate } from '../../../common/utils/bricks/dates';

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

/**
 * Builds the meta line of a template: how big it is and when it was saved.
 *
 * The date of the creation rather than of the update: only the caption ever gets
 * updated, and "saved" after a rename would name a different event.
 *
 * The translator arrives as an argument so that the utility of the summary does not
 * become a hidden consumer of i18n — it would then depend on whether a composer is up.
 *
 * @param template - The summary of the template.
 * @param translate - The translator of the messages.
 * @returns A line of the "12 blocks · 14.08.2026" kind.
 */
export function buildTemplateMetaLine(
    template: TBricksTemplateSummary,
    translate: (key: string, params?: Record<string, unknown>) => string
): string {
    return [
        translate('bricks.templates.card.blocks', { count: template.blocksCount }),
        formatPageDate(template.createdAt),
    ].join(' · ');
}
