/**
 * Promise pool with a concurrency limit (isomorphic, no dependencies).
 * Used by the data sources renderer: a page with dozens of components must not
 * open an unbounded number of simultaneous requests during SSR.
 */

/**
 * Runs tasks with a cap on how many of them are in flight at once.
 * Result order follows task order; a failing task rejects the shared promise
 * (the calling code decides for itself whether to swallow task errors).
 *
 * @param tasks - Lazy task queue (functions that create a promise).
 * @param limit - Maximum number of tasks running at once (at least 1).
 * @returns Results of all tasks in their original order.
 */
export async function runWithConcurrencyLimit<T>(
    tasks: ReadonlyArray<() => Promise<T>>,
    limit: number
): Promise<T[]> {
    const results: T[] = new Array(tasks.length);
    const workersCount = Math.min(Math.max(1, Math.floor(limit)), tasks.length);
    let nextIndex = 0;

    /**
     * Takes tasks off the shared queue one after another until it runs dry.
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
