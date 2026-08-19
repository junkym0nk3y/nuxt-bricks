import type { IPageVersionSummary } from '../../../common/types/bricks-api';
import { formatPageDateTime } from '../../../common/utils/bricks/dates';

/**
 * Форматирует дату сохранённой версии — момент, когда снятое состояние
 * сохранили (`pageUpdatedAt`), а не когда его вытеснили (`createdAt`): снапшот
 * делается на следующем сохранении, поэтому `createdAt` подписал бы версию
 * чужим временем. Одна функция на карточку галереи и на подтверждение отката:
 * пользователь не должен выбирать состояние по одной дате, а видеть перед
 * необратимым действием другую.
 *
 * Сам формат дат живёт в `common/utils/bricks/dates.ts` — его читают и шаблоны.
 *
 * @param version - Сводка версии.
 * @returns Отформатированные дата и время (`createdAt` — запасной на случай
 * пустой колонки у версий, снятых до появления `pageUpdatedAt`).
 */
export function formatPageVersionDateTime(version: IPageVersionSummary): string {
    return formatPageDateTime(version.pageUpdatedAt ?? version.createdAt);
}
