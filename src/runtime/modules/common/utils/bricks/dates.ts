/**
 * Формат дат интерфейса дашборда: строки списка страниц, карточки шаблонов,
 * панель деталей и подтверждения.
 *
 * Живёт в `common`, а не в домене публикации: тот же формат читают шаблоны, и
 * вторая копия функции разошлась бы с первой при первой же правке формата.
 * Дата сохранённой ВЕРСИИ страницы остаётся в `publish/utils/dates.ts` — она
 * знает про тип снапшота и никому больше не нужна.
 */

/**
 * Форматирует дату в `DD.MM.YYYY` (формат дашборда).
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

/**
 * Форматирует дату в `DD.MM.YYYY HH:mm` (список версий — несколько снапшотов в день).
 *
 * @param rawDate - ISO-строка даты.
 * @returns Отформатированные дата и время или «—» для пустых/битых значений.
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
