/**
 * Форматирует дату страницы в `DD.MM.YYYY` (формат дашборда).
 *
 * @param rawDate - ISO-строка даты (createdAt/updatedAt).
 * @returns Отформатированная дата или «—» для пустых/битых значений.
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
