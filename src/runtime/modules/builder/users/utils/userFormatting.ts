// #region Imports
// Types
import type { IBricksUserSummary } from '../../../common/types/auth';
// #endregion

// #region Data
/** Миллисекунды в сутках — шаг сравнения календарных дат «сегодня/вчера». */
const DAY_MS = 24 * 60 * 60 * 1000;
// #endregion

/**
 * Подпись учётки: отображаемое имя, если оно задано, иначе логин.
 *
 * Одна функция на строку списка, подтверждения и доступные имена кнопок: строка
 * называет человека именем, а подтверждение удаления — тем же самым, иначе
 * человек сверяет разные подписи в двух окнах одной операции.
 *
 * @param user - Учётка.
 * @returns Имя для показа.
 */
export function resolveUserLabel(user: IBricksUserSummary): string {
    return user.displayName?.trim() || user.username;
}

/**
 * Форматирует дату в `DD.MM.YYYY`.
 *
 * Формат тот же, что в списке страниц, и считается так же — по локальному
 * времени браузера: две даты в одном интерфейсе не должны считаться от разных
 * точек отсчёта. Пустое и битое значение — прочерк, а не «сегодня»: неизвестную
 * дату нельзя показывать конкретным днём.
 *
 * @param rawDate - ISO-строка даты.
 * @returns Дата или прочерк.
 */
export function formatUserDate(rawDate: string | null | undefined): string {
    const parsed = toValidDate(rawDate);

    if (!parsed) {
        return '—';
    }

    const day = String(parsed.getDate()).padStart(2, '0');
    const month = String(parsed.getMonth() + 1).padStart(2, '0');

    return `${day}.${month}.${parsed.getFullYear()}`;
}

/**
 * Форматирует момент последнего входа: `сегодня, ЧЧ:ММ` и `вчера, ЧЧ:ММ` для
 * двух последних календарных дней, дальше — просто дата.
 *
 * Время показывается только у свежих входов, и это не украшение: «вошёл сегодня»
 * отвечает на вопрос «человек ещё работает?», а у входа месячной давности точный
 * час не значит ничего. Дни сравниваются календарно, а не разностью в 24 часа:
 * вход в 23:50 не должен называться сегодняшним на следующее утро.
 *
 * @param rawDate - ISO-строка последнего входа; null — не входил ни разу.
 * @param labels - Подписи относительных дней (переводы приходят снаружи).
 * @returns Готовая подпись или null, если входа не было.
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
        return formatUserDate(rawDate);
    }

    const hours = String(parsed.getHours()).padStart(2, '0');
    const minutes = String(parsed.getMinutes()).padStart(2, '0');
    const dayLabel = daysAgo === 0 ? labels.today : labels.yesterday;

    return `${dayLabel}, ${hours}:${minutes}`;
}

// #region Methods
/**
 * Разбирает ISO-строку в дату, отбрасывая пустые и неразбираемые значения.
 *
 * @param rawDate - ISO-строка даты.
 * @returns Дата или null.
 */
function toValidDate(rawDate: string | null | undefined): Date | null {
    if (!rawDate) {
        return null;
    }

    const parsed = new Date(rawDate);

    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Считает, сколько КАЛЕНДАРНЫХ дней назад была дата: 0 — сегодня, 1 — вчера.
 *
 * Обе точки приводятся к полуночи локального дня, поэтому переход суток
 * считается по календарю, а не по прошедшим часам. Отрицательный результат
 * (дата из будущего — рассинхронизация часов сервера и браузера) сводится к
 * нулю: «вошёл сегодня» здесь безобиднее, чем дата, которой ещё не было.
 *
 * @param date - Сравниваемая дата.
 * @returns Число календарных дней до сегодняшнего.
 */
function countCalendarDaysAgo(date: Date): number {
    const startOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

    return Math.max(0, Math.round((startOfToday - startOfDay) / DAY_MS));
}
// #endregion
