/**
 * Пул промисов с лимитом одновременности (изоморфный, без зависимостей).
 * Используется рендерером data sources: страница с десятками компонентов
 * не должна открывать неограниченное число одновременных запросов на SSR.
 */

/**
 * Выполняет задачи с ограничением числа одновременных.
 * Порядок результатов соответствует порядку задач; ошибка задачи
 * отклоняет общий промис (вызывающий код сам решает, глотать ли ошибки задач).
 *
 * @param tasks - Ленивая очередь задач (функции, создающие промис).
 * @param limit - Максимум одновременно выполняемых задач (минимум 1).
 * @returns Результаты всех задач в исходном порядке.
 */
export async function runWithConcurrencyLimit<T>(
    tasks: ReadonlyArray<() => Promise<T>>,
    limit: number
): Promise<T[]> {
    const results: T[] = new Array(tasks.length);
    const workersCount = Math.min(Math.max(1, Math.floor(limit)), tasks.length);
    let nextIndex = 0;

    /**
     * Последовательно забирает задачи из общей очереди, пока она не опустеет.
     */
    async function runWorker(): Promise<void> {
        while (nextIndex < tasks.length) {
            const currentIndex = nextIndex;
            nextIndex += 1;
            results[currentIndex] = await tasks[currentIndex]();
        }
    }

    await Promise.all(Array.from({ length: workersCount }, () => runWorker()));

    return results;
}
