import type { IPageVersionSummary } from '../../../common/types/bricks-api';
import { formatPageDateTime } from '../../../common/utils/bricks/dates';

/**
 * Formats the date of a saved version: the moment the captured state was saved,
 * not the moment it was displaced. Which of the two dates a version is signed
 * with, and why, is decided by `IPageVersionSummary`.
 *
 * One function for the gallery card and for the restore confirmation: a person
 * must not pick a state by one date and then read another one in front of an
 * irreversible action.
 *
 * The date format itself lives in `common/utils/bricks/dates.ts` — templates
 * read it too.
 *
 * @param version - Version summary.
 * @returns Formatted date and time (`createdAt` is the fallback for an empty
 * column on the versions captured before `pageUpdatedAt` appeared).
 */
export function formatPageVersionDateTime(version: IPageVersionSummary): string {
    return formatPageDateTime(version.pageUpdatedAt ?? version.createdAt);
}
