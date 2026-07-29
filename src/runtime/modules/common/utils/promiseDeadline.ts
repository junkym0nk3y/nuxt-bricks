/**
 * Wall-clock дедлайн вокруг промиса (чистая изоморфная утилита).
 *
 * Нужна там, где потолок транспорта не работает: на SSR относительные URL
 * выполняются внутренним вызовом Nitro (`fetchNodeRequestHandler`), а он
 * `AbortSignal` не слушает вовсе — ни `timeout` ofetch, ни собственный
 * `AbortController` вызывающего такой запрос не оборвут (BM-27). Единственное,
 * что остаётся снаружи, — перестать его ждать.
 *
 * Обработчик при этом продолжает работу: гонка освобождает ожидающего, но не
 * ресурс. Для самого ресурса нужен серверный лимит (у HTTP-backend он есть —
 * `persistence/server/http/httpClient.ts`).
 */

/**
 * Ждёт промис не дольше дедлайна.
 *
 * @param operation - Ожидаемый промис.
 * @param timeoutMs - Потолок ожидания в миллисекундах.
 * @param createTimeoutError - Фабрика ошибки дедлайна: текст и тип решает
 * вызывающий (у SSR-lookup'а это HTTP-статус, у сессии — локализованная строка).
 * @returns Значение промиса.
 * @throws Ошибка из `createTimeoutError`, если дедлайн истёк первым.
 */
export function withPromiseDeadline<T>(
    operation: Promise<T>,
    timeoutMs: number,
    createTimeoutError: () => Error
): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | null = null;

    const deadline = new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(createTimeoutError()), timeoutMs);
    });

    // Таймер снимается в обоих исходах: незачищенный держал бы event loop
    // Node открытым до конца дедлайна на каждый SSR-запрос
    return Promise.race([operation, deadline]).finally(() => {
        if (timer !== null) {
            clearTimeout(timer);
        }
    });
}
