// #region Imports
// Types
import type { IBricksUserSummary } from '../../../common/types/auth';

// Utils
import { formatPageDate } from '../../../common/utils/bricks/dates';
// #endregion

// #region Data
/** Milliseconds in a day — the step of the "today/yesterday" calendar comparison */
const DAY_MS = 24 * 60 * 60 * 1000;
// #endregion

/**
 * The caption of an account: the display name when it is set, the username
 * otherwise.
 *
 * One function for the list row, the confirmations and the accessible names of the
 * buttons: the row calls a person by their name and the delete confirmation calls
 * them by the very same one, otherwise a person is left comparing two different
 * captions across two windows of a single operation.
 *
 * @param user - The account.
 * @returns The name to show.
 */
export function resolveUserLabel(user: IBricksUserSummary): string {
    return user.displayName?.trim() || user.username;
}

/**
 * Formats the moment of the last sign-in: `today, HH:mm` and `yesterday, HH:mm` for
 * the two most recent calendar days, a plain date beyond them.
 *
 * The time is shown for fresh sign-ins only, and that is not decoration: "signed in
 * today" answers the question "is this person still working here?", while for a
 * sign-in a month old the exact hour means nothing. The days are compared by the
 * calendar rather than by a difference of 24 hours: a sign-in at 23:50 must not be
 * called today's the next morning.
 *
 * @param rawDate - ISO string of the last sign-in; null — never signed in.
 * @param labels - Captions of the relative days (the translations come from
 * outside).
 * @returns The ready caption, or null when there was no sign-in.
 */
export function formatUserLoginDate(
    rawDate: string | null | undefined,
    labels: { today: string; yesterday: string }
): string | null {
    const parsed = toValidDate(rawDate);

    if (!parsed) {
        return null;
    }

    const daysAgo = countCalendarDaysAgo(parsed);

    if (daysAgo > 1) {
        return formatPageDate(rawDate);
    }

    const hours = String(parsed.getHours()).padStart(2, '0');
    const minutes = String(parsed.getMinutes()).padStart(2, '0');
    const dayLabel = daysAgo === 0 ? labels.today : labels.yesterday;

    return `${dayLabel}, ${hours}:${minutes}`;
}

// #region Methods
/**
 * Parses an ISO string into a date, dropping empty and unparsable values.
 *
 * @param rawDate - ISO date string.
 * @returns The date, or null.
 */
function toValidDate(rawDate: string | null | undefined): Date | null {
    if (!rawDate) {
        return null;
    }

    const parsed = new Date(rawDate);

    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Counts how many CALENDAR days ago the date was: 0 — today, 1 — yesterday.
 *
 * Both points are brought to the midnight of their local day, so the turn of the
 * day is counted by the calendar rather than by the hours that have passed. A
 * negative result (a date from the future — the clocks of the server and the
 * browser out of sync) is clamped to zero: "signed in today" is more harmless here
 * than a date that has not arrived yet.
 *
 * @param date - The date being compared.
 * @returns The number of calendar days up to today.
 */
function countCalendarDaysAgo(date: Date): number {
    const startOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

    return Math.max(0, Math.round((startOfToday - startOfDay) / DAY_MS));
}
// #endregion
