/**
 * Чтение списка страниц: сам запрос с отсечением устаревших ответов
 * (`runLoadAllPages`) и однократная загрузка «есть ли у нас список» вместо
 * «освежи список» (`ensureAllPagesLoaded`).
 *
 * Отдельно от стора, потому что состояние здесь не только реактивное:
 * незавершённый запрос живёт вне state (промис не сериализуется в SSR payload), а
 * логика отсечения и повторов тестируется без Pinia.
 */
import type { IPagesLoadStoreDeps } from '../types/publishStore';
import { fetchAllPagesRequest } from './publishApi';

/**
 * Незавершённые загрузки — по экземпляру стора (на сервере их по одному на
 * запрос). Нужны, чтобы параллельные читатели (открытие сессии билдера и
 * селектор страниц в тулбаре) ждали один запрос, а не слали по своему.
 */
const pendingPagesLoads = new WeakMap<object, Promise<void>>();

/**
 * Сколько раз повторяется запрос, пока не придёт полный серверный снимок.
 * Повтор нужен потому, что `loadAllPages` штатно завершается, не применив
 * вытесненный ответ (например, его обогнала локальная запись) — тогда в сторе
 * лежат только локально известные строки, и считать их полным списком нельзя:
 * открытие сессии по такому списку приняло бы существующую страницу за новую.
 * Потолок — чтобы поток записей не превратил ожидание в бесконечную очередь.
 */
const PAGES_LOAD_ATTEMPTS = 3;

/**
 * Загружает список всех страниц и кладёт его в стор.
 *
 * Ошибку только бросает: `generalError` — поле формы публикации, и запись туда
 * доносила текст чужой страницы до открытой. Запрос списка уходит из bootstrap'а
 * сессии, поэтому падение загрузки на покинутой странице подсвечивало ошибку в
 * сайдбаре той, что уже открыта. Каждый вызывающий обрабатывает отказ сам:
 * дашборд — своим тостом, bootstrap сессии — блокирующим экраном,
 * `toPageWriteError` — конфликтом ревизии, освежение после создания
 * (`runPublishPage`) — предупреждением в консоль.
 *
 * @param store - Узкий контракт стора.
 */
export async function runLoadAllPages(store: IPagesLoadStoreDeps): Promise<void> {
    const requestId = ++store.pagesRequestId;

    try {
        const pages = await fetchAllPagesRequest();

        // Устаревший ответ не заменяет более свежий список: два запроса в полёте —
        // обычное дело (уход с одной страницы на другую, сохранение параллельно с
        // открытием), а порядок ответов не гарантирован. С устаревшим списком
        // расходятся и point-lookup по pagename, и проверка занятости слага, и
        // дашборд
        if (requestId !== store.pagesRequestId) {
            return;
        }

        store.publishedPages = pages;
        store.pagesLoadedAt = Date.now();
    } catch (error: unknown) {
        // Отказ вытесненного запроса вызывающему не докладывается: список уже
        // обновлён более свежим запросом, а ошибка устаревшего перевела бы в
        // состояние отказа актуальный bootstrap сессии — блокирующим экраном
        // поверх рабочей страницы
        if (requestId !== store.pagesRequestId) {
            return;
        }

        console.error('[Publish Store] Failed to load pages:', error);
        throw error;
    }
}

/**
 * Гарантирует полный список страниц в сторе и даёт дождаться уже летящей
 * загрузки. Повторный вход при загруженном списке возвращается сразу.
 *
 * Ошибку не глушит: у открытия сессии отказ означает блокирующий экран, у
 * селектора — оставленный кеш, и решать это вызывающему. Исчерпанные попытки —
 * тоже отказ, а не тихий успех: с частичным списком открытие сессии приняло бы
 * существующую страницу за новую и подставило пустой холст.
 *
 * @param store - Узкий контракт стора.
 * @param failedMessage - Текст отказа, если полный список так и не получен.
 */
export async function ensureAllPagesLoaded(
    store: IPagesLoadStoreDeps,
    failedMessage: string
): Promise<void> {
    if (store.pagesLoadedAt !== null) {
        return;
    }

    const pending = pendingPagesLoads.get(store);
    if (pending) {
        await pending;
        return;
    }

    const request = (async () => {
        for (
            let attempt = 0;
            attempt < PAGES_LOAD_ATTEMPTS && store.pagesLoadedAt === null;
            attempt += 1
        ) {
            await store.loadAllPages();
        }

        if (store.pagesLoadedAt === null) {
            throw new Error(failedMessage);
        }
    })();

    pendingPagesLoads.set(store, request);

    try {
        await request;
    } finally {
        // Только свой промис: за время ожидания место мог занять следующий
        if (pendingPagesLoads.get(store) === request) {
            pendingPagesLoads.delete(store);
        }
    }
}
