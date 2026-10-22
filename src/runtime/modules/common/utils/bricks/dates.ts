/**
 * Date format of the dashboard interface: the rows of the page list, the template
 * cards, the details panel, the confirmations and the account rows.
 *
 * It lives in `common` rather than in the publishing domain: the templates read the
 * same format, and a second copy of the function would drift away from the first on
 * the very first edit of the format. The date of a saved page VERSION stays in
 * `publish/utils/dates.ts` — it knows about the snapshot type and nobody else needs
 * it.
 */

/**
 * Formats a date as `DD.MM.YYYY` (the dashboard format).
 *
 * The day is the CALENDAR day of the browser (`getDate`/`getMonth`/`getFullYear`),
 * not of UTC: two dates shown in one interface must not be counted from different
 * origins, and the neighbor of this date in the account row — the relative "today"
 * and "yesterday" of the last sign-in — is counted by the local calendar as well.
 *
 * @param rawDate - ISO date string (createdAt/updatedAt).
 * @returns The formatted date, or an em dash for empty and broken values.
 */
export function formatPageDate(rawDate: string | null | undefined): string {
    if (!rawDate) {
        return '—';
    }

    const parsedDate = new Date(rawDate);

    if (Number.isNaN(parsedDate.getTime())) {
        return '—';
    }

    const day = String(parsedDate.getDate()).padStart(2, '0');
    const month = String(parsedDate.getMonth() + 1).padStart(2, '0');
    const year = parsedDate.getFullYear();

    return `${day}.${month}.${year}`;
}

/**
 * Formats a date as `DD.MM.YYYY HH:mm` (the version list — several snapshots a day).
 *
 * @param rawDate - ISO date string.
 * @returns The formatted date and time, or an em dash for empty and broken values.
 */
export function formatPageDateTime(rawDate: string | null | undefined): string {
    const formattedDate = formatPageDate(rawDate);

    if (formattedDate === '—') {
        return formattedDate;
    }

    const parsedDate = new Date(rawDate as string);
    const hours = String(parsedDate.getHours()).padStart(2, '0');
    const minutes = String(parsedDate.getMinutes()).padStart(2, '0');

    return `${formattedDate} ${hours}:${minutes}`;
}
